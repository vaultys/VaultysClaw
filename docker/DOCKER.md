# Docker Deployment

All-in-one stack for running VaultysClaw locally or in a self-hosted environment.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24 with the Compose plugin
- Ports 3000, 4000, 5001, 5432, 5555, 8080, 9000, 9001 available on the host

## Quick start

```bash
# First run — builds images and starts all services
docker compose up --build

# Subsequent runs (no code changes)
docker compose up
```

The stack is ready when you see `wait-for-db: postgres:5432 is up — starting app.` followed by the Next.js startup output from `control-plane`.

## Services and URLs

| Service         | URL                       | Credentials                                     |
|-----------------|---------------------------|-------------------------------------------------|
| Control Plane   | http://localhost:3000     | Passwordless login via VaultysId QR code        |
| WebSocket       | ws://localhost:8080       | Used by agent controllers                       |
| LiteLLM proxy   | http://localhost:4000     | Master key: `sk-demo-insecure-changeme`         |
| MinIO console   | http://localhost:9001     | `minioadmin` / `minioadmin123`                  |
| MinIO API       | http://localhost:9000     | Same credentials                                |
| Docling         | http://localhost:5001     | No auth                                         |
| Prisma Studio   | http://localhost:5555     | No auth (DB browser, dev only)                  |
| PostgreSQL      | localhost:5432            | User `vaultys`, password `vaultys_dev_secret`   |

> **LiteLLM models** are registered dynamically through the Control Plane UI — no static config required.

## Stop / restart

```bash
# Stop all containers (data is preserved)
docker compose down

# Stop and remove all data volumes (full reset)
docker compose down -v

# Restart a single service without rebuilding
docker compose restart control-plane

# Rebuild and restart one service after a code change
docker compose up --build control-plane
```

## Environment variables

All variables have safe defaults for local development. Override by creating a `.env.compose` file and passing it explicitly:

```bash
cp .env.compose.example .env.compose   # if it exists
docker compose --env-file .env.compose up --build
```

| Variable              | Default                        | Description                          |
|-----------------------|--------------------------------|--------------------------------------|
| `PG_PASSWORD`         | `vaultys_dev_secret`           | PostgreSQL password                  |
| `PG_PORT`             | `5432`                         | Host port for PostgreSQL             |
| `NEXTAUTH_SECRET`     | `insecure-dev-secret-change-me`| NextAuth session signing secret      |
| `NEXTAUTH_URL`        | `http://localhost:3000`        | Public URL of the control plane      |
| `LITELLM_MASTER_KEY`  | `sk-demo-insecure-changeme`    | LiteLLM proxy master key             |
| `MINIO_ROOT_USER`     | `minioadmin`                   | MinIO root user                      |
| `MINIO_ROOT_PASSWORD` | `minioadmin123`                | MinIO root password                  |

> Change `NEXTAUTH_SECRET` and `LITELLM_MASTER_KEY` for any non-local deployment.

## Data persistence

Two named Docker volumes store persistent data:

| Volume     | Contents                                |
|------------|-----------------------------------------|
| `pgdata`   | PostgreSQL data (agents, workflows, …)  |
| `miniodata`| Uploaded files                          |

`docker compose down` preserves them. `docker compose down -v` deletes them.

## Connecting an agent controller

Once the stack is up, start an agent and point it at the control plane:

```bash
CONTROL_PLANE_URL=http://localhost:3000 \
LLM_MODEL=<model-id> \
LLM_API_KEY=<your-key> \
pnpm agent:dev
```

Then approve the agent in the Control Plane UI at http://localhost:3000.

## Troubleshooting

**Port already in use**

Check what is using the port and stop it, or override the host port:

```bash
# Example: run PostgreSQL on host port 5433 instead of 5432
PG_PORT=5433 docker compose up
```

**Tables do not exist / `P2021` error**

The Prisma migrations did not run. This is fixed in the current `Dockerfile.control-plane` (migrations run automatically before the server starts). If you have an older image cached, force a rebuild:

```bash
docker compose down && docker compose up --build
```

**Containers cannot reach `postgres:5432`**

This is a Docker network edge-case that can occur after a failed first start. Fix it by doing a clean restart:

```bash
docker compose down --remove-orphans && docker compose up --build
```

If the problem persists, connect the container manually while the stack is running:

```bash
docker network connect vaultysclaw_default vaultysclaw-postgres-1
```

**LiteLLM `source_url` column errors**

A stale `pgdata` volume from an older LiteLLM version. These errors are non-fatal (LiteLLM still starts), but to silence them do a full reset:

```bash
docker compose down -v && docker compose up --build
```
