# packages/notifier

Standalone Node worker that turns notification **events** into delivered
**notifications**. It consumes the BullMQ `notifications` queue (Redis) that the
control plane produces to, resolves who should be notified and how, then delivers
via email, in-app (a DB row), and push (Redis pub/sub → the control plane's SSE
stream → the browser).

It is decoupled from the control plane on purpose: the HTTP request that triggers
an event only enqueues a job and returns; all fan-out, preference lookup and
delivery happen here, out of band.

## Run

```bash
pnpm notifier:dev     # from repo root — node --import tsx --watch src/index.ts
pnpm notifier:start   # node --import tsx src/index.ts
```

Requires `DATABASE_URL` (Postgres) and `REDIS_URL`. In Docker it's the `notifier`
service (`docker/Dockerfile.notifier` + `docker/docker-compose.yml`).

> **Run it with `node --import tsx`, not the bare `tsx` CLI.** The `tsx` binary
> applies `@vaultysclaw/shared`'s `"tsx"` export condition and resolves it
> inconsistently (src vs dist), which breaks named imports. `node --import tsx`
> resolves shared via its `import` → `dist` consistently. `shared` must stay a
> native-ESM build (`"type": "module"` + `fix-esm-extensions`) for this to work.

## Files

- **`src/index.ts`** — entry point. Creates the BullMQ `Worker`, a dedicated
  ioredis publisher, wires signals for graceful shutdown, and runs `deliver()`
  per recipient. BullMQ connections are built from `REDIS_URL` via
  `connectionFromUrl` (parsed options, so BullMQ uses its own ioredis and avoids
  a duplicate-instance type clash).
- **`src/recipients.ts`** — pure-ish resolution logic, **dependency-injected DB**
  (`NotifierDb`) so it's unit-testable without Prisma:
  - `resolveRecipients(db, job)` — routes by the event's catalog `audience`
    (`target` → the payload's user; `workspaceMembers` → members of
    `data.workspaceId`; `admins` → all Admins/Owners; `owners` → Owners). Note
    `audience` (who receives) is decoupled from `level` (who may configure it).
  - `resolvePrefs(db, userId, eventType, defaults)` — explicit stored prefs, else
    the event's catalog `defaultChannels`.
  - `normalizeRole` / `isAdmin` / `isOwner` — mirror `control-plane/lib/roles.ts`.
- **`src/render.ts`** — `renderNotification(eventType, data)` → `{ title, body }`.
  Add a `case` here when adding an event that needs custom copy.
- **`src/prisma.ts`** — Prisma client (same generated client + schema as the
  control plane; pg adapter). Reads/writes `users`, `notifications`,
  `notification_preferences`, `settings`.
- **`src/smtp.ts`** — nodemailer sender that reads SMTP config from the `settings`
  table (same keys the control-plane UI writes). Returns `false` (no throw) when
  SMTP is unconfigured.

## Delivery rules (`deliver`)

Per recipient, resolve channel prefs, then:
- **in-app** enabled → insert a `Notification` row (this is what the bell loads).
- **in-app or push** enabled → publish to `notif:user:<id>` (Redis) so the live
  SSE stream updates the bell and/or raises a system notification (`push: true`).
- **email** enabled and the user has an email → `sendMail`.
- All channels off → nothing is delivered.

## Adding an event

The catalog lives in `@vaultysclaw/shared` (`src/notifications.ts`), not here.
Add it there (with its `level` + `defaultChannels`), emit it from the control
plane via `enqueueNotification`, then add a render `case` in `src/render.ts` and,
if it needs a non-standard audience, extend `resolveRecipients`.

## Prisma in Docker

The image copies the control-plane schema into `packages/notifier/prisma/` and
runs `prisma generate --generator client` (only the `client` generator — the zod
generator needs control-plane devDeps that aren't installed here). Generating
from inside the notifier package is what lets Prisma resolve `@prisma/client`.

## Tests

Unit tests live at the repo root: `__tests__/notifier-recipients.test.ts`
(recipient/preference/role/render logic via a stub DB) and
`__tests__/notifications-catalog.test.ts` (shared catalog). Run with
`pnpm vitest run __tests__/notifier-recipients.test.ts`.
