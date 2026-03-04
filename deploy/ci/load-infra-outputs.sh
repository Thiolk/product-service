#!/usr/bin/env bash
set -euo pipefail

test -f infra-outputs.json

export KUBE_CONTEXT="$(jq -r '.kube_context.value' infra-outputs.json)"
export INGRESS_NS="$(jq -r '.ingress_namespace.value' infra-outputs.json)"
export INGRESS_SVC="$(jq -r '.ingress_controller_service.value' infra-outputs.json)"

echo "KUBE_CONTEXT=$KUBE_CONTEXT"
echo "INGRESS_NS=$INGRESS_NS"
echo "INGRESS_SVC=$INGRESS_SVC"