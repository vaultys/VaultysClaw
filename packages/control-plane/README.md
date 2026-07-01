# @vaultysclaw/control-plane

The central control plane for VaultysClaw: a Next.js (App Router) dashboard plus a
WebSocket server that manages agents, distributes signed policies, routes intents,
runs workflows, and records an audit log. This is where administrators govern the
fleet.

- **HTTP / dashboard**: port `3000`
- **Agent WebSocket**: port `8080`

## Key pieces

- **`server.ts`** — entry point: starts HTTP + WS servers, runs Prisma migrations,
  launches the workflow scheduler.
- **`lib/ws-server.ts`** — agent connections, heartbeats, intent routing, admin WS.
- **`lib/workflow-executor.ts`** — sequential/parallel workflow execution with approvals.
- **`app/api/`** — REST handlers by domain (agents, workflows, governance, workspaces,
  users, models, skills, channels, …).
- **`lib/contracts/`** — ts-rest contracts (the source of truth for the typed API).
- **`prisma/`** + **`db/`** — PostgreSQL schema and DAOs.

## Authentication

Passwordless QR-code login via [VaultysId](https://github.com/vaultys/id) — no
passwords. Wired through `next-auth` with a custom provider in `lib/auth-config.ts`.

## Development

```bash
# From the repo root (preferred — uses a local data dir):
pnpm vaultysclaw:dev

# Or directly in this package:
pnpm dev          # tsx watch server.ts
pnpm build        # tsc && next build
pnpm start        # node dist/server.js
pnpm lint
pnpm type-check
pnpm test
```

Requires a PostgreSQL database (set `DATABASE_URL`). `postinstall` runs
`prisma generate` automatically.

## Configuration

Reads from `.env` in this package. See [`.env.example`](./.env.example). Common keys:

| Variable           | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `DATABASE_URL`     | PostgreSQL connection string (Prisma)      |
| `PORT` / `WS_PORT` | HTTP + WebSocket ports (default 3000/8080) |
| `NEXTAUTH_SECRET`  | NextAuth session secret                    |
| `LITELLM_BASE_URL` | LiteLLM proxy URL                          |

## API conventions

New REST routes follow the **ts-rest + `APIException`** pattern. See the root
[CLAUDE.md](../../CLAUDE.md) for the full guide and `lib/contracts/agents/` as the
canonical reference.
