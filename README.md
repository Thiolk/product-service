# Order Service

REST API for order management.

## Version
- Current release: 1.0.0

## Prerequisites
- Docker


## Build (Docker)

From the repo root:

```bash
docker build -t product-service:local -f Dockerfile .
```

## Run (Docker)

### Port mapping
The Order Service listens on port 3001 inside the container (per startup logs). To access it on your laptop at localhost:5000, map:
host 5000 → container 3001

### Run Command
```bash
docker run --rm -p 5000:3001 product-service:local
```

### Verify
```bash
curl -i http://localhost:5000/health
```

## Configuration (Env Variables)
you may configure:
- PORT (default: 3001)
- DB_HOST
- DB_PORT (default: 5432)
- DB_NAME
- DB_USER
- DB_PASSWORD