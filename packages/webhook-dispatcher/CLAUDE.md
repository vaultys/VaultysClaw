# packages/webhook-dispatcher

Standalone Node worker that turns webhook **events** into signed HTTP **deliveries**.
It consumes the BullMQ `webhooks` queue (Redis) that the control plane produces
to, looks up every active `Webhook` subscription whose `events` include the event
type, and POSTs a signed JSON body to each endpoint.

Decoupled from the control plane on purpose: the HTTP request that triggers an
event only enqueues a job and returns; all fan-out, signing and delivery happen
here, out of band.

## Delivery, retries & dead-letter

BullMQ's retry policy is set on the **producer** job (`control-plane/lib/webhook-queue.ts`:
5 attempts, exponential backoff, base 2 s). This worker retries the **whole job**
when any endpoint fails (throws → BullMQ re-runs the job).

To keep whole-job retry safe for fan-out, the worker records which endpoints
already succeeded in the job's own data (`_delivered: string[]`, via
`job.updateData`) and `processWebhookJob` skips them on the next attempt — so a
partial failure only re-hits the endpoints that actually failed, and healthy
endpoints are never double-delivered (delivery stays at-least-once per endpoint).

When a job exhausts all attempts it is moved to the **dead-letter queue**
(`WEBHOOK_DLQ_NAME = "webhooks:dead"`) as a `DeadWebhookJob` (original job +
`failedAt` + `attemptsMade` + last `error` + `deliveredEndpointIds`) instead of
being dropped. Inspect it with any BullMQ tooling; to **replay**, re-enqueue the
wrapped `job` on `WEBHOOK_QUEUE_NAME` (skip `deliveredEndpointIds` to avoid
double-delivery). Both the DLQ name and `DeadWebhookJob` type live in
`@vaultysclaw/shared`. Delivery itself is still not persisted to Postgres.

## Run

```bash
pnpm webhook:dev     # from repo root — node --import tsx --watch src/index.ts
pnpm webhook:start   # node --import tsx src/index.ts
```

Requires `DATABASE_URL` (Postgres) and `REDIS_URL`. Optional `WEBHOOK_TIMEOUT_MS`
(default 10000). In Docker it's the `webhook-dispatcher` service
(`docker/Dockerfile.webhook-dispatcher` + `docker/docker-compose.yml`).

> **Run it with `node --import tsx`, not the bare `tsx` CLI** — same reason as the
> notifier: `shared`'s `"tsx"` export condition resolves inconsistently. `shared`
> must stay a native-ESM build.

## Files

- **`src/index.ts`** — entry point / wiring only. Creates the BullMQ `Worker` +
  dead-letter `Queue`, injects `fetch` + the Prisma-backed `loadActiveWebhooks`
  into `delivery.ts`, tracks `_delivered` across retries, and dead-letters on
  final failure. No delivery logic of its own.
- **`src/delivery.ts`** — the pure / injectable delivery logic (no BullMQ,
  Prisma or ambient I/O): `buildDeliveryRequest`, `selectTargets`, `deliverOne`
  (never throws — captures the outcome), `processWebhookJob` (fan-out + retry
  skip), and the dead-letter helpers `shouldDeadLetter` / `buildDeadLetter`.
  This is the unit-tested surface.
- **`src/sign.ts`** — `sign(secret, timestamp, rawBody)` → `sha256=<hmac>`
  (HMAC-SHA256 over `${timestamp}.${rawBody}`, Stripe/GitHub-style).
- **`src/prisma.ts`** — Prisma client (same generated client + schema as the
  control plane; pg adapter). Reads the `webhooks` table.

## Tests

`__tests__/webhook-dispatcher.test.ts` (repo root, default vitest config — no
Redis/DB/network). Covers `delivery.ts` + `sign.ts` through their injectable
seams: signature round-trip, request/header construction, target selection,
per-endpoint delivery outcomes (2xx / non-2xx / network error), the retry-skip
of already-delivered endpoints, and the dead-letter decision. `index.ts` (the
BullMQ/Prisma wiring) is intentionally not imported by the tests — keep new
delivery logic in `delivery.ts` so it stays testable. Run:
`pnpm vitest run __tests__/webhook-dispatcher.test.ts`.

## Outgoing request

`POST <endpoint>` with headers:

- `X-VaultysClaw-Event` — event type
- `X-VaultysClaw-Delivery` — unique delivery uuid
- `X-VaultysClaw-Timestamp` — ms epoch used in the signature
- `X-VaultysClaw-Signature` — `sha256=<hmac(timestamp + "." + rawBody)>`

Body: `{ event, occurredAt, data }` where `data` is the sanitized, event-specific
payload built at the emission site (never any secret / key material).

## Verifying a signature (receiver side)

Recompute `HMAC-SHA256(secret, `${timestamp}.${rawBody}`)` with the stored secret
and the raw request body, and compare to the `X-VaultysClaw-Signature` header.

## Adding an event

The catalog lives in `@vaultysclaw/shared` (`src/webhooks.ts`), not here. Add it
there, then emit it from the control plane via `enqueueWebhook` at the domain
site (build the payload with a helper in `control-plane/lib/webhook-payloads.ts`).
No change is needed here — the dispatcher is event-agnostic.

**You must also update the docs** in the same change: add the event's example to
`EXAMPLE_PAYLOADS` in `control-plane/lib/webhook-docs.ts`, otherwise the
`/admin/webhooks/docs` reference shows an empty `{}` payload for it. See the full
checklist in the root `CLAUDE.md` → Webhooks → "Adding or changing a webhook event".

## Prisma in Docker

Same trick as the notifier: the image copies the control-plane schema into
`packages/webhook-dispatcher/prisma/` and runs `prisma generate --generator
client` (only the `client` generator).
