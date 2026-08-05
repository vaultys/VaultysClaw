# packages/webhook-dispatcher

Standalone Node worker that turns domain **events** into two kinds of delivery:
signed HTTP **webhooks** (raw JSON, receiver-interpreted) and, per
docs/REBUILD_ARCHITECTURE.md §5, human-facing **Notification Channels** (rendered
title/body, fanned out through a self-hosted Apprise API container) — "one event
pipeline, not two" (§5.1): the same worker, consuming the same BullMQ `webhooks`
queue, fans every job out to both subscription kinds per event.

Decoupled from the control plane on purpose: the HTTP request that triggers an
event only enqueues a job and returns; all fan-out, rendering, signing and
delivery happen here, out of band.

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
(`WEBHOOK_DLQ_NAME = "webhooks-dead"` — a colon, its original value, is not a
legal BullMQ queue name; that was never caught until this file's `Queue`
construction actually ran against real BullMQ for the first time, since
`index.ts` is intentionally excluded from the unit tests, see Tests below) as a
`DeadWebhookJob` (original job +
`failedAt` + `attemptsMade` + last `error` + `deliveredEndpointIds`) instead of
being dropped. Inspect it with any BullMQ tooling; to **replay**, re-enqueue the
wrapped `job` on `WEBHOOK_QUEUE_NAME` (skip `deliveredEndpointIds` to avoid
double-delivery). Both the DLQ name and `DeadWebhookJob` type live in
`@vaultysclaw/shared`. Delivery itself is still not persisted to Postgres.

**Notification Channels use the identical retry-skip shape**, tracked
separately (`_notifiedChannels: string[]`, since a channel id and a webhook
endpoint id are different namespaces) — `processNotificationJob` mirrors
`processWebhookJob` exactly for this. They are **not** currently dead-lettered
on final failure — only `_delivered` (webhooks) feeds `buildDeadLetter` — a
deliberate, documented simplification: an internal ops alert failing to send is
lower-stakes than a signed webhook meant to sync external systems, and
`DeadWebhookJob`'s shape is webhook-specific (`deliveredEndpointIds`). Extend it
if that stops being true for your deployment.

## Run

```bash
pnpm webhook:dev     # from repo root — node --import tsx --watch src/index.ts
pnpm webhook:start   # node --import tsx src/index.ts
```

Requires `DATABASE_URL` (Postgres) and `REDIS_URL`. Optional `WEBHOOK_TIMEOUT_MS`
(default 10000), `BULLMQ_PREFIX` (namespaces every BullMQ key this process
touches — unset for the standard control-plane deployment; set it when running
a second instance against a different app's schema on shared Redis, e.g.
`"vaultysclaw-controlplane"` for `packages/controlplane`, matching that
producer's own prefix), and `APPRISE_API_URL` (base URL of the self-hosted
Apprise API container — unset disables Notification Channel fan-out entirely,
webhook delivery is unaffected either way). In Docker it's the
`webhook-dispatcher` service (`docker/Dockerfile.webhook-dispatcher` +
`docker/docker-compose.yml`).

> **Run it with `node --import tsx`, not the bare `tsx` CLI** — same reason as the
> notifier: `shared`'s `"tsx"` export condition resolves inconsistently. `shared`
> must stay a native-ESM build.

**This package has no `prisma/schema.prisma` of its own locally** — only Docker copies one in (see
Prisma in Docker below), so running `pnpm webhook:dev` straight from a fresh clone fails with
`does not provide an export named 'PrismaClient'` (the resolved `@prisma/client` was never
generated at all). For `packages/controlplane`, `pnpm controlplane:webhook:dev` (root
`package.json`) does the copy-and-generate step first automatically
(`controlplane:webhook:prisma`) — use that instead of this package's own `dev` script when testing
against that schema locally.

## Files

- **`src/index.ts`** — entry point / wiring only. Creates the BullMQ `Worker` +
  dead-letter `Queue`, injects `fetch` + the Prisma-backed `loadActiveWebhooks`/
  `loadActiveNotificationChannels` into `delivery.ts`, runs both fan-outs per
  job in parallel, tracks `_delivered`/`_notifiedChannels` across retries, and
  dead-letters on final failure. No delivery logic of its own.
- **`src/delivery.ts`** — the pure / injectable delivery logic (no BullMQ,
  Prisma or ambient I/O): `buildDeliveryRequest`, `selectTargets`, `deliverOne`
  (never throws — captures the outcome), `processWebhookJob` (fan-out + retry
  skip) for webhooks; `selectNotificationTargets`, `processNotificationJob`
  (same shape, skips when Apprise isn't configured or an event has no
  render template) for Notification Channels; and the dead-letter helpers
  `shouldDeadLetter` / `buildDeadLetter`. This is the unit-tested surface.
- **`src/sign.ts`** — `sign(secret, timestamp, rawBody)` → `sha256=<hmac>`
  (HMAC-SHA256 over `${timestamp}.${rawBody}`, Stripe/GitHub-style).
- **`src/apprise.ts`** — `notifyApprise(fetch, baseUrl, appriseKey, {title,
  body, type})`, delivery-time only. Never needs a channel's `serviceUrls` —
  Apprise already has them from `/add`, pushed at admin-CRUD time by
  `packages/controlplane/lib/apprise.ts` (a separate module, since only that
  process can decrypt the encrypted column). Confirmed empirically against the
  real `caronc/apprise` image: `/notify/<key>` accepts `{title, body, type}`
  and returns `{"error": null}` on success.
- **`src/render.ts`** — `renderNotification(job)` → `{title, body, type}` or
  `null`. Templates for `packages/controlplane`'s event catalog (actor.*, human.*,
  certificate.*, workspace.*) only — `packages/control-plane`'s own domain
  (agent/model/etc.) doesn't have Notification Channels wired up yet; that
  migration (rebuild doc §8 step 4) would add its own templates here, keyed
  the same way. Every rendered body gets a uniform footer appended
  (`appendFooter`, not repeated per template), in this order: field-level
  changes (`appendChanges`, from `job.payload.changes: FieldChange[]` — only
  present on `*.updated` events, "Changes:\n  field: from → to" per entry,
  `formatValue` rendering `null`/`""`/`[]` as `(none)` rather than a blank);
  what was granted (`appendGrantedCapabilities`, from
  `job.payload.grantedCapabilities` — `actor.approved` only, explicit
  "(no capabilities)" rather than silence when the array is empty); "By:
  `<name>`" from `job.payload.performedBy` when present (absent for events
  with no human origin); and "View: `<adminUrl>`" from `job.payload.adminUrl`
  when present. All of these are attached at the emission site in
  packages/controlplane (`lib/webhook-payloads.ts`'s `diffFields`/
  `buildAdminUrl`/`actorAdminUrl`), not derived here — this file only ever
  reads them, keeping it free of that app's domain/routing logic.
- **`src/prisma.ts`** — Prisma client (same generated client + schema as
  whichever app this instance is deployed for; pg adapter). Reads the
  `webhooks` and (if the schema has it) `notification_channels` tables.

## Tests

`__tests__/webhook-dispatcher.test.ts` (repo root, default vitest config — no
Redis/DB/network). Covers `delivery.ts` + `sign.ts` through their injectable
seams: signature round-trip, request/header construction, target selection,
per-endpoint delivery outcomes (2xx / non-2xx / network error), the retry-skip
of already-delivered endpoints, and the dead-letter decision — plus the
Notification Channel side (`renderNotification`, `selectNotificationTargets`,
`processNotificationJob`: unknown event, no-template, Apprise-not-configured,
fan-out, mixed success/failure, retry-skip). `index.ts` (the BullMQ/Prisma
wiring) is intentionally not imported by the tests — keep new delivery logic in
`delivery.ts` so it stays testable. Run:
`pnpm vitest run __tests__/webhook-dispatcher.test.ts`.

Also verified against real infrastructure (not committed as a repeatable
test): a real `caronc/apprise` container + a local HTTP listener, pushing a
channel's config via `/add`, delivering through the actual
`processNotificationJob` code path, and confirming the listener received the
exact rendered title/body — using real data from a real Actor row, not a
fixture.

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
site (build the payload with a helper in `control-plane/lib/webhook-payloads.ts`,
or `controlplane/lib/webhook-payloads.ts` for that package's own events).
**Webhooks need no change here** — that half of the dispatcher is
event-agnostic, it just forwards whatever's in `payload`.

**Notification Channels do need a change here** if you want the new event to
also produce a human-facing alert: add a renderer for it to `RENDERERS` in
`src/render.ts`. Skipping this isn't a bug the way an empty webhook docs
example is — `processNotificationJob` just treats an event with no template as
`skipped: "no-template"` and moves on — but it does mean that event silently
never reaches any Notification Channel, so do it deliberately, not by omission.

**You must also update the docs** in the same change: add the event's example to
`EXAMPLE_PAYLOADS` in the relevant package's `lib/webhook-docs.ts`, otherwise
its webhook docs reference shows an empty `{}` payload for it. See the full
checklist in the root `CLAUDE.md` → Webhooks → "Adding or changing a webhook event".

## Notification Channels

The other half of the same pipeline (docs/REBUILD_ARCHITECTURE.md §5) — see
`src/apprise.ts`/`src/render.ts` above for the delivery-time pieces, and
`packages/controlplane/CLAUDE.md`'s Notification Channels section for the
admin-CRUD side (schema, encryption, `/add`/`/del`). Two things worth knowing
if you're deploying this:

- **Requires the target schema to have a `NotificationChannel` model.**
  `packages/controlplane`'s schema has one; `packages/control-plane`'s doesn't
  yet (that's a future step-4 migration for that package, rebuild doc §8). Set
  `APPRISE_API_URL` only for a deployment whose schema actually has the table
  — this code doesn't defensively check for the table's existence before
  querying it.
- **The real `caronc/apprise` image is POST-only on `/del`** (a bare `DELETE`
  returns 405) — confirmed empirically, not assumed from
  docs/REBUILD_ARCHITECTURE.md's description of that endpoint. Not this
  package's concern directly (that call lives in `packages/controlplane`'s own
  `lib/apprise.ts`), but worth knowing if you're touching either.

## Prisma in Docker

Same trick as the notifier: the image copies the control-plane schema into
`packages/webhook-dispatcher/prisma/` and runs `prisma generate --generator
client` (only the `client` generator). A `packages/controlplane`-flavored
deployment needs its own Dockerfile variant copying that package's
`prisma/schema.prisma` instead — not built/committed yet (this package's own
deployment story is still "throwaway instance for verification", see Tests
above), tracked in `packages/controlplane/CLAUDE.md`'s deferred list.
