# Docker

Three compose files live here. Only the first one runs the application; the other two start
backing services for local work and use different ports so all three can coexist.

| File | What it is | Ports |
|---|---|---|
| `docker-compose.yml` | **The deployed stack** — control plane + webhook dispatcher + Postgres + Redis + Apprise. Built by `.github/workflows/docker-build.yml`, started by `.github/workflows/deploy.yml`. | 3000, 8080, 5432, 6380 |
| `docker-compose.controlplane.yml` | Dev infra for `pnpm controlplane:dev`. Postgres + Redis + Apprise only — the app runs on the host. | 5433, 6381, 8000 |
| `docker-compose.simulator.yml` | The fleet simulator's own disposable database. | 5434 |

The last two are driven by the root package scripts (`pnpm controlplane:docker:up`,
`pnpm simulator:up`) — see the root `CLAUDE.md`. Everything below is about the first one.

## The deployed stack

```bash
# From the repo root. Fill in the secrets first.
cp .env.compose.example docker/.env
$EDITOR docker/.env          # NEXTAUTH_SECRET + PG_PASSWORD at minimum

cd docker
docker compose up --build -d
docker compose logs -f controlplane
```

Compose reads `docker/.env` automatically when run from this directory, which is exactly what the
deploy workflow does over SSH.

| Service | URL | Notes |
|---|---|---|
| Control plane | http://localhost:3000 | Passwordless login via VaultysId QR code |
| WebSocket | ws://localhost:8080 | Where agents, sensors and the SDK connect |
| PostgreSQL | localhost:5432 | User `vaultys`, password from `PG_PASSWORD` |
| Redis | localhost:6380 | Host port only; in-network it is `redis:6379` |
| Apprise | — | No host port, reachable only inside the compose network |
| Webhook dispatcher | — | No port; a worker consuming the BullMQ queue |

Ready when `wait-for-db: postgres:5432 is up — starting app.` is followed by
`HTTP server listening` and `Control plane WebSocket server listening`.

The control plane container runs `prisma migrate deploy` before starting the server, so the schema
is applied on every deploy.

### What is not in the stack

LiteLLM, MinIO, Docling, Prisma Studio and the notifier were all part of the pre-rebuild
architecture and were removed in `30bf747`. The Model Registry is now configured in the console
(Integrations → Models), storing its master key encrypted; `LITELLM_BASE_URL` /
`LITELLM_MASTER_KEY` remain only as a deployment-time fallback, pointing at a proxy you run
yourself.

## Images

| Dockerfile | Package | Entrypoint |
|---|---|---|
| `Dockerfile.controlplane` | `packages/controlplane` | `prisma migrate deploy && tsx server.ts` |
| `Dockerfile.webhook-dispatcher` | `packages/webhook-dispatcher` | `node --import tsx src/index.ts` |

Both build from the **repo root** as context (`context: ..`), because a workspace package can't be
built without the workspace root manifest and its workspace dependencies.

Two things about them are load-bearing:

- **Each lists the workspace packages by hand** — the manifests it copies, and stubs for the ones
  it doesn't. A new package under `packages/` means updating both files, or workspace resolution
  fails inside the image while `pnpm install` on the host stays perfectly happy.
  `docker-build.yml` exists to catch exactly that on a PR.
- **pnpm is pinned to the exact version** in the root `package.json`'s `packageManager` field.
  pnpm refuses to run a project pinned to a different version, so bumping that field means bumping
  both Dockerfiles.

The dispatcher has no Prisma schema of its own: the image copies
`packages/controlplane/prisma/schema.prisma` in and generates the client from it, mirroring what
`pnpm controlplane:webhook:prisma` does on the host.

## Environment variables

`.env.compose.example` at the repo root documents every variable with its default. The two that
must be changed for any non-local deployment are `NEXTAUTH_SECRET` and `PG_PASSWORD`.

## Stop / restart / reset

```bash
docker compose down                     # stop, keep data
docker compose down -v                  # stop and delete the volumes — full reset, ledger included
docker compose down --remove-orphans    # also drop containers of services no longer in the file
docker compose restart controlplane     # restart one service without rebuilding
docker compose up --build -d controlplane   # rebuild and restart one service after a code change
```

Persistent data lives in three named volumes: `pgdata` (the ledger — agents, certificates, audit
log), `redisdata` (queue state) and `appriseconfig`.

> The compose file deliberately sets no `name:`, so the project name stays the directory (`docker`)
> and `pgdata` keeps resolving to the existing `docker_pgdata` volume on the deploy server. Naming
> the project would point the stack at fresh, empty volumes — a new ledger and a lost database.

## Troubleshooting

**A port is already in use.** Override the host-side port; the in-container ports never change:

```bash
PG_PORT=5433 CONTROLPLANE_PORT=3100 docker compose up -d
```

**`P2021` / tables do not exist.** Migrations didn't run. Check `docker compose logs controlplane`
for the `prisma migrate deploy` output, then rebuild: `docker compose up --build -d controlplane`.

**Containers can't reach `postgres:5432`.** Usually the aftermath of a failed first start. Clean
restart: `docker compose down --remove-orphans && docker compose up --build -d`.

**Webhooks deliver nothing, but the console shows an active subscription.** The dispatcher is
reading a different Postgres or a different BullMQ prefix than the control plane writes to. In
this stack both come from the same compose variables (`PG_PASSWORD`, `BULLMQ_PREFIX`); if you
overrode either for one service only, that's the cause.
