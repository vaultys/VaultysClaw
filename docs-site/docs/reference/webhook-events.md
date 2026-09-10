---
sidebar_position: 2
title: Webhook event reference
description: Every event the rebuilt control plane emits, what triggers it, and what it carries.
---

# Webhook event reference

Events flow to three places from one `recordEvent()` call: the
[audit log](/docs/concepts/audit-log), [webhooks](/docs/guides/webhooks), and
[notification channels](/docs/guides/notification-channels) — the last of these
only for events that have a renderer; see [the caution below](#adding-an-event).

:::tip The console has a generated version of this page
`/admin/integrations/webhooks/docs` builds its examples by running **the real
payload builders** over sample objects, so a documented example cannot drift from
what is actually sent. Use it when you need byte-exact payloads; use this page for
the overview.
:::

## Common fields

Every payload carries the entity plus:

| Field | Present when |
|---|---|
| `performedBy` | A human caused the event. **Absent** otherwise. |
| `adminUrl` | Always — an absolute deep link to the relevant console page |
| `changes` | Update events — `[{field, from, to}]` |

## Actors

| Event | Trigger | Notes |
|---|---|---|
| `actor.registration_requested` | An unknown DID completes the handshake | No `performedBy` — no human caused it. `adminUrl` points at the Actors **list**, since no Actor row exists yet. |
| `actor.approved` | An admin approves a pending registration | Carries `grantedCapabilities` — the filtered set actually persisted, not the raw submission |
| `actor.denied` | An admin denies one | `adminUrl` points at the list, for the same reason |
| `actor.updated` | An Actor's name, workspace, or email changes | Carries a field-level diff. Email requires an extra lookup, since it lives on the human profile rather than the Actor. |
| `human.invited` | An admin creates an invitation | No Actor exists yet, so a small inline payload rather than a full Actor payload |
| `human.invitation_redeemed` | An invitation is successfully redeemed | Full Actor payload plus who invited them |
| `actor.deleted` | An admin deletes an Actor | `adminUrl` points at the list — the row is gone. Carries what the Actor *was*, since nothing can be looked up afterwards. |

An Actor payload deliberately **excludes** `kindConfig` — kind-specific and not
guaranteed safe or meaningful — and location fields.

## Certificates

| Event | Trigger |
|---|---|
| `certificate.issued` | Any issuance path — interactive, admin-issued, or bootstrap |
| `certificate.revoked` | An admin revokes, with the required reason |

A certificate payload deliberately **excludes** the certificate bytes and the
embedded request bytes.

## Workspaces

| Event | Trigger |
|---|---|
| `workspace.created` | A workspace is created |
| `workspace.updated` | Name, description, or colour changes — with a diff |

`workspace.deleted` exists in the shared catalog but **has no emission site** —
there is no workspace-delete action in this control plane at all.

## Models

| Event | Trigger |
|---|---|
| `model.created` | A model is registered |
| `model.updated` | Any edit, **including workspace access grants and revocations**, which carry an explicit `workspaceAccess` diff rather than a new event type |
| `model.deleted` | A model is removed; access rows cascade away |

A model payload reports `hasProviderKey`, deliberately **not** `hasApiKey` — the
recursive secret filter matches `apikey` case-insensitively, so the latter name
would be silently stripped from every delivered payload despite carrying no
secret.

## Proxy & harness

| Event | Trigger |
|---|---|
| `proxy.config_updated` | An interception point's configuration or rule set changes |
| `harness.config_updated` | A [harness supervisor's](/docs/architecture/agent-kinds#harness--supervised-coding-harness) mode, confinement setting, or resource rules change |

Both carry the *shape* of the change — mode, rule counts, freshness bound — and
never the rule set itself. The two kinds are siblings by design, so their payloads
are too.

## Custom capabilities

| Event | Trigger |
|---|---|
| `capability.created` | An admin registers a `vendor:action` name |
| `capability.updated` | Its description or metadata changes |
| `capability.deleted` | An admin removes it — which is a [mass revoke](/docs/concepts/capabilities#deleting-a-registry-entry-is-a-mass-revoke) across every holder, not a tidy-up |

`capability.deleted` is the one on this page worth wiring to an alert: it changes
what resolves for every certificate carrying the name, on those clients' next
refresh.

## Events that will never fire here

The shared catalog also defines events belonging to the older control plane —
`user.*`, `agent.*`, `knowledge.*`, `skill.*`, `workflow.*`. (`capability.*` is
**not** in that group: those fire here, and are documented above.) The catalog is
genuinely shared so the two applications cannot fork it, and the console filters
subscription forms down to the groups this application actually emits.

You will never be offered a checkbox for an event that cannot arrive.

## SSO events

There are none. The shared catalog defines no `sso.*` events, and inventing some
here would emit events the other control plane's catalog does not know. Connection
changes are recorded in the audit log instead — and those entries never carry a
client secret.

## Adding an event

Four things change together, or the reference drifts:

1. The **catalog** entry in the shared package — type, label, description, group.
2. The **emission site**, calling `recordEvent()`.
3. The **payload builder** — an explicit allow-list. Never add a secret field.
4. The **documentation example**, built from the real builder.

A new event with no example falls back to `{}` in the generated reference. That is
a bug, not an acceptable state.

:::caution An event with no renderer reaches webhooks but not channels
`renderNotification` returns `null` for an event type it has no renderer for, and
a null render is skipped — silently. So step 4 is not cosmetic: **omitting a
renderer means the event is delivered to every webhook subscription and to no
notification channel at all**, with nothing logged to say so.

Currently missing renderers, and therefore invisible to notification channels:
`capability.created`, `capability.updated`, `capability.deleted`, `model.created`,
`model.updated`, `model.deleted`. Their webhook delivery is unaffected.
:::
