pipeline {
  agent any

  environment {
    PATH = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

    DOCKERHUB_USER   = "thiolengkiat413"
    IMAGE_NAME       = "product-service"
    DOCKERFILE_PATH  = "deploy/docker/Dockerfile"

    K8S_DIR = "k8s/product-service/overlays"
    INFRA_JOB = "terraform-infra"
    INFRA_OUTPUTS_GENERIC = "infra-outputs.json"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Determine Pipeline Mode') {
      steps {
        script {
          env.IMAGE_TAG   = ""
          env.TARGET_ENV  = "build"
          def branch  = env.BRANCH_NAME ?: ""
          def tagName = env.TAG_NAME?.trim()
          env.RELEASE_TAG = tagName ?: ""

          if (tagName) {
            env.TARGET_ENV = "prod"
          } else if (branch == "main") {
            env.TARGET_ENV = "staging"          // deploy-to-staging happens here
          } else if (branch == "develop") {
            env.TARGET_ENV = "dev"
          } else if (branch.startsWith("release/")) {
            env.TARGET_ENV = "rc"               // release candidate validation only
          } else {
            env.TARGET_ENV = "build"            // feature/* or other branches
          }

          echo "BRANCH_NAME: ${branch}"
          echo "TAG_NAME: ${tagName ?: 'none'}"
          echo "TARGET_ENV: ${env.TARGET_ENV}"
        }
      }
    }

    stage('Install Deps') {
      steps {
        sh '''
          set -eux
          npm ci
        '''
      }
    }

    stage('Build (Lint/Format)') {
      when { expression { env.TARGET_ENV == "build" } }
      steps {
        sh '''
          set -eux
          npm run lint
          npm run format:check
        '''
      }
    }

    stage('Test (Unit)') {
      steps {
        sh '''
          set -eux
          npm run test:unit
        '''
      }
    }

    stage('Test (Integration)') {
      when { expression { env.TARGET_ENV in ["build", "rc"] } }
      steps {
        sh '''
          set -eux
          npm run test:integration
        '''
      }
    }

    stage('Static Analysis (SonarQube)') {
      when { expression { env.TARGET_ENV == "build" } }
      environment {
        SONAR_PROJECT_KEY = 'product-service'
      }
      steps {
        withSonarQubeEnv('SonarQubeServer') {
          sh '''
            set -eux
            mkdir -p .scannerwork

            sonar-scanner \
              -Dsonar.projectKey="${SONAR_PROJECT_KEY}" \
              -Dsonar.host.url="${SONAR_HOST_URL}" \
              -Dsonar.token="${SONAR_AUTH_TOKEN}" \
              -Dsonar.working.directory=".scannerwork"
          '''
        }
      }
    }

    stage('Quality Gate') {
      when { expression { env.TARGET_ENV == "build" } }
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Resolve Image Tags') {
      steps {
        script {
          def releaseTag = (env.RELEASE_TAG ?: "").trim()

          if (env.TARGET_ENV == "prod") {
            if (!releaseTag) {
              error("Prod build requires a Git tag (RELEASE_TAG).")
            }
            env.IMAGE_TAG = releaseTag
          } else {
            env.IMAGE_TAG = "${env.TARGET_ENV}-${env.BUILD_NUMBER}"
          }

          echo "Resolved image tag strategy:"
          echo "  TARGET_ENV  = ${env.TARGET_ENV}"
          echo "  IMAGE_TAG   = ${env.IMAGE_TAG}"
          echo "  RELEASE_TAG = ${releaseTag ?: 'none'}"
          echo "  BUILD_NUMBER= ${env.BUILD_NUMBER}"
        }
      }
    }

    stage('Container Build') {
      steps {
        sh '''
          set -eux
          docker build -f "${DOCKERFILE_PATH}" -t "${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}" .
        '''
      }
    }

    stage('Security Scan (Docker Scout - notify only, mandatory)') {
      steps {
        sh '''
          set -eux
          IMAGE="${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}" ./scripts/security-docker-scout-scan.sh
        '''
      }
    }

    stage('Tag Latest (Prod only)') {
      when { expression { return env.TARGET_ENV == "prod" } }
      steps {
        sh '''
          set -eux
          docker tag "${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}" "${DOCKERHUB_USER}/${IMAGE_NAME}:latest"
        '''
      }
    }

    stage('Container Push') {
      when { expression { return env.TARGET_ENV in ["dev","staging","prod"] } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          sh '''
            set -eux
            echo "${DH_PASS}" | docker login -u "${DH_USER}" --password-stdin
            docker push "${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}"

            if [ "${TARGET_ENV}" = "prod" ]; then
              docker push "${DOCKERHUB_USER}/${IMAGE_NAME}:latest"
            fi
          '''
        }
      }
    }

    stage('Fetch Infra Outputs (Terraform)') {
      when { expression { return env.TARGET_ENV in ["dev","staging","prod"] } }
      steps {
        script {
          def envFile = "infra-outputs-${env.TARGET_ENV}.json"
          sh 'rm -f infra-outputs*.json || true'

          try {
            copyArtifacts(
              projectName: env.INFRA_JOB,
              selector: lastSuccessful(),
              filter: "${envFile},${env.INFRA_OUTPUTS_GENERIC}",
              fingerprintArtifacts: true,
              optional: false
            )
          } catch (err) {
            error("""
                  Could not copy artifacts from infra job '${env.INFRA_JOB}'.
                  - Ensure the job exists and archives infra-outputs.json (and preferably infra-outputs-${env.TARGET_ENV}.json).
                  - Ensure the "Copy Artifact" plugin is installed.
                  Original error: ${err}
                  """)
          }

          sh """
            set -eux
            if [ -f "${envFile}" ]; then
              cp "${envFile}" infra-outputs.json
            fi
            test -f infra-outputs.json
            echo "Using infra outputs:"
            ls -la infra-outputs.json
          """
        }
      }
    }

    stage('Deploy (Dev)') {
      when { expression { return env.TARGET_ENV == "dev" } }
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-minikube', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            set -eux
            export KUBECONFIG="$KUBECONFIG_FILE"

            # Load ingress/controller details from Terraform outputs (infra-outputs.json)
            chmod +x deploy/ci/load-infra-outputs.sh deploy/ci/smoke-test-ingress.sh
            ./deploy/ci/load-infra-outputs.sh

            # Use kube context from outputs (usually "minikube")
            kubectl config use-context "$KUBE_CONTEXT"

            NS=dev
            HOST="product-dev.local"
            OVERLAY="${K8S_DIR}/dev"
            IMAGE="${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}"

            kubectl kustomize "$OVERLAY" | kubectl -n "$NS" apply -f -
            kubectl -n "$NS" set image deployment/product-service product-service="$IMAGE"
            kubectl -n "$NS" rollout status deployment/product-service --timeout=180s

            # Smoke test (reuses your existing port-forward logic, now parameterized)
            ./deploy/ci/smoke-test-ingress.sh "$HOST" "/health"
          '''
        }
      }
    }

    stage('Deploy (Staging)') {
      when { expression { return env.TARGET_ENV == "staging" } }
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-minikube', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            set -eux
            export KUBECONFIG="$KUBECONFIG_FILE"

            chmod +x deploy/ci/load-infra-outputs.sh deploy/ci/smoke-test-ingress.sh
            ./deploy/ci/load-infra-outputs.sh
            kubectl config use-context "$KUBE_CONTEXT"

            NS=staging
            HOST="product-staging.local"
            OVERLAY="${K8S_DIR}/staging"
            IMAGE="${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}"

            kubectl kustomize "$OVERLAY" | kubectl -n "$NS" apply -f -
            kubectl -n "$NS" set image deployment/product-service product-service="$IMAGE"
            kubectl -n "$NS" rollout status deployment/product-service --timeout=180s

            ./deploy/ci/smoke-test-ingress.sh "$HOST" "/health"
          '''
        }
      }
    }

    stage('Prod Eligibility Check (tag must be on main)') {
      when { expression { return env.TARGET_ENV == "prod" } }
      steps {
        sh '''
          set -eux
          echo "HEAD:"
          git show -s --oneline --decorate HEAD
          echo "Tags pointing at HEAD:"
          git tag --points-at HEAD

          if git tag --points-at HEAD | grep -qx "${TAG_NAME}"; then
            echo "OK: HEAD is correctly tagged with ${TAG_NAME}"
          else
            echo "BLOCK: HEAD is not tagged with ${TAG_NAME}"
            exit 1
          fi
        '''
      }
    }

    stage('Prod Approval') {
      when { expression { return env.TARGET_ENV == "prod" } }
      steps {
        script {
          timeout(time: 30, unit: 'MINUTES') {
            input message: "Approve PROD deploy for ${env.IMAGE_NAME} on main? (Tag: ${env.RELEASE_TAG})", ok: "Deploy"
          }
        }
      }
    }

    stage('Deploy (Prod)') {
      when { expression { return env.TARGET_ENV == "prod" } }
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-minikube', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            set -eux
            export KUBECONFIG="$KUBECONFIG_FILE"

            chmod +x deploy/ci/load-infra-outputs.sh deploy/ci/smoke-test-ingress.sh
            ./deploy/ci/load-infra-outputs.sh
            kubectl config use-context "$KUBE_CONTEXT"

            NS=prod
            HOST="product-prod.local"
            OVERLAY="${K8S_DIR}/prod"
            IMAGE="${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}"

            kubectl kustomize "$OVERLAY" | kubectl -n "$NS" apply -f -
            kubectl -n "$NS" set image deployment/product-service product-service="$IMAGE"
            kubectl -n "$NS" rollout status deployment/product-service --timeout=180s

            ./deploy/ci/smoke-test-ingress.sh "$HOST" "/health"
          '''
        }
      }
    }
  }

  post {
    always {
      script {
        def didDeploy = (env.TARGET_ENV in ['dev', 'staging', 'prod'])

        sh '''
          set +e
          echo "========== POST (always) =========="
          echo "JOB:        ${JOB_NAME}"
          echo "BUILD:      ${BUILD_NUMBER}"
          echo "BRANCH:     ${BRANCH_NAME:-none}"
          echo "TAG:        ${TAG_NAME:-none}"
          echo "TARGET_ENV: ${TARGET_ENV:-unknown}"
          echo "IMAGE:      ${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG:-none}"
          echo "WORKSPACE:  ${WORKSPACE}"
          echo "==================================="

          mkdir -p artifacts || true

          if [ -f infra-outputs.json ]; then
            cp -f infra-outputs.json artifacts/infra-outputs.json || true
          fi

          if [ -f /tmp/ingress-pf.log ]; then
            echo ""
            echo "---- tail /tmp/ingress-pf.log ----"
            tail -n 120 /tmp/ingress-pf.log || true
            cp -f /tmp/ingress-pf.log artifacts/ingress-pf.log || true
          fi

          if [ -d .scannerwork ]; then
            tar -czf artifacts/scannerwork.tgz .scannerwork 2>/dev/null || true
          fi
        '''

        if (didDeploy) {
          withCredentials([file(credentialsId: 'kubeconfig-minikube', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              set +e
              export KUBECONFIG="$KUBECONFIG_FILE"
              NS="${TARGET_ENV}"

              echo ""
              echo "========== K8S DEBUG (ns=$NS) =========="

              echo "-- Namespaces --"
              kubectl get ns || true

              echo ""
              echo "-- Workload snapshot --"
              kubectl -n "$NS" get deploy,rs,po,svc,ingress -o wide || true

              echo ""
              echo "-- Describe key resources (product-service) --"
              kubectl -n "$NS" describe deployment product-service || true
              kubectl -n "$NS" describe svc product-service || true
              kubectl -n "$NS" describe ingress product-service || true

              echo ""
              echo "-- Pod logs (last 200 lines each) --"
              for p in $(kubectl -n "$NS" get pods -o name 2>/dev/null | sed 's#pod/##'); do
                echo ""
                echo "### logs: $p"
                kubectl -n "$NS" logs "$p" --tail=200 || true
              done

              echo ""
              echo "-- Recent events (last 60) --"
              kubectl -n "$NS" get events --sort-by=.lastTimestamp | tail -n 60 || true

              echo "========================================"
            '''
          }
        }
      }

      archiveArtifacts artifacts: 'artifacts/**', allowEmptyArchive: true
    }

    failure {
      sh '''
        set +e
        echo "Build FAILED. Check console logs + archived artifacts/ for ingress log and scannerwork."
      '''
    }

    cleanup {
      sh '''
        set +e
        rm -rf artifacts || true
      '''
    }
  }
}