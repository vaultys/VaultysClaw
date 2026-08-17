---
sidebar_position: 6
title: Webhooks
description: Signed HTTP delivery of every domain event to an endpoint you control.
---

# Webhooks

Raw, signed JSON delivered to a URL you fully control — your SIEM, your own
endpoint. VaultysClaw does not know or care what is on the other end.

Configured under **Integrations → Webhooks**.

## Setting one up

1. Name, description, and endpoint URL.
2. Pick event types. Only events this control plane actually emits are offered —
   you cannot subscribe to something that will never arrive.
3. Save. **The signing secret is shown exactly once.** Store it now; regenerating
   is the only way to see a new one.

## Verifying the signature

```
X-VaultysClaw-Signature: sha256=<hmac-sha256(secret, timestamp + "." + rawBody)>
```

Compute over the **raw body**, not a re-serialised parse. Compare in constant
time, and reject a timestamp outside your tolerance window to bound replay.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, timestamp: string, header: string, secret: string) {
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## Payload shape

Payloads are built by **explicit per-entity allow-list builders** — never by
serialising a database row. On top of that, a recursive key blacklist strips
anything secret-shaped as defence in depth.

An Actor payload deliberately excludes `kindConfig` (kind-specific, not guaranteed
safe or meaningful) and location fields. A certificate payload deliberately
excludes the certificate bytes themselves.

Beyond the entity, each event carries:

| Field | Meaning |
|---|---|
| `performedBy` | `{did, name}` of the admin who acted — **absent** for events with no human origin, such as an Actor's own registration attempt |
| `adminUrl` | Absolute deep link back to the relevant console page |
| `changes` | Field-level diff, `[{field, from, to}]`, for update events |
| `grantedCapabilities` | For `actor.approved` — the filtered set actually persisted, not the raw submission |

```json
{
  "eventType": "actor.approved",
  "timestamp": "2026-08-17T09:14:22.031Z",
  "data": {
    "did": "did:vaultys:…",
    "name": "edge-sensor-04",
    "kind": "sensor",
    "workspaceId": "default",
    "grantedCapabilities": ["process_read"],
    "performedBy": { "did": "did:vaultys:…", "name": "admin test" },
    "adminUrl": "https://controlplane.example.com/admin/actors/…"
  }
}
```

The console's built-in reference generates its examples by running **the real
payload builders** over sample objects, so a documented example cannot drift from
what is actually sent.

## Events

| Group | Events |
|---|---|
| Actors | `actor.registration_requested`, `actor.approved`, `actor.denied`, `actor.updated`, `human.invited`, `human.invitation_redeemed` |
| Certificates | `certificate.issued`, `certificate.revoked` |
| Workspaces | `workspace.created`, `workspace.updated` |
| Models | `model.created`, `model.updated`, `model.deleted` |
| Proxy | `proxy.config_updated` |

Full detail: [webhook event reference](/docs/reference/webhook-events).

## Delivery requires a running dispatcher

The control plane **enqueues**; a separate worker delivers.

```bash
pnpm controlplane:webhook:dev
```

Without a running dispatcher, events enqueue correctly and sit in the queue
forever. Enqueueing does not throw when nothing is consuming, so nothing surfaces
the gap on its own.

:::tip The health panel checks the right thing
Integrations shows three independent checks. Redis and Apprise are checked by
direct reachability. **Dispatcher** is checked by asking the queue whether any
worker is registered on it — the only signal that actually answers "is anything
consuming this right now", which reachability cannot.
:::

## Queue isolation

The rebuilt control plane uses a distinct BullMQ prefix,
`vaultysclaw-controlplane`, on the same queue name as the older package. A shared
Redis must never let one dispatcher treat two apps' jobs as one queue, since their
databases are entirely separate.

Running a dispatcher for this schema is a **deployment-time configuration
difference**, not a code change: point it at this database and set the matching
prefix.

## Operational notes

- Requests time out per endpoint, configurable.
- Failed webhook deliveries are dead-lettered. **Notification-channel failures
  currently are not** — a documented limitation, not an oversight.
- Regenerating a secret invalidates the old one immediately and reveals the new
  one once.
- Deactivating a webhook stops delivery without losing its configuration.
