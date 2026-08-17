---
sidebar_position: 7
title: Notification channels
description: Human-facing alerts fanned out through a self-hosted Apprise container — Slack, email, PagerDuty, ntfy, and the rest.
---

# Notification channels

The other half of the same pipeline webhooks use. Same event catalog, same queue,
same worker — one dispatcher fans each event out to both subscription kinds. It is
not two pipelines.

The difference is the audience. A webhook is raw signed JSON for a system. A
notification channel is a rendered title and body for a person.

## Why Apprise

VaultysClaw renders `{title, body, type}` and asks a self-hosted
[Apprise](https://github.com/caronc/apprise-api) container to deliver it. Apprise
owns every actual integration — Slack, email, Teams, PagerDuty, ntfy, and roughly
a hundred others.

That boundary is the point: VaultysClaw holds no per-service delivery code, and
replacing Apprise with ntfy or a self-built relay later touches exactly one
integration point.

Apprise holds no VaultysClaw-specific logic and needs no authentication of its
own. It sits on an internal network, reachable only from the control plane's admin
API and the dispatcher, **never exposed externally**.

## Creating a channel

**Integrations → Notification Channels**.

1. Name it — "Ops Slack", "Security on-call".
2. Paste one or more Apprise service URLs, one per line:
   ```
   slack://token-a/token-b/token-c
   mailto://user:pass@smtp.example.com
   pagerduty://integration-key@api-key
   ```
3. Pick which events trigger it.
4. Save.

On save, the control plane encrypts the service URLs, stores the row, and pushes
the URLs into Apprise's own store under a generated key.

:::note Failures on create are loud, failures on delete are not
Create and update **throw** if Apprise rejects the URLs or is unreachable — you
need to know immediately, not discover later that a channel silently never
delivered anything.

Delete is more lenient: a failed Apprise cleanup is logged but the local row is
still removed, since an unreachable Apprise should not permanently block an admin
from clearing their own list.
:::

## How the secrets are handled

Service URLs routinely embed credentials — `mailto://user:pass@host` is the
obvious case — so they are **encrypted at rest** using the same vault primitive
that protects LiteLLM master keys and SSO client secrets. One code path, not a new
one.

The field is **write-only** in the edit form: never decrypted back into the page,
and blank means "keep the existing value".

Two details worth knowing:

- The URL **scheme** is extracted before encryption and stored in the clear, as a
  plain list. It is not sensitive, and it is the one thing that lets an admin tell
  channels apart in the list view.
- **The dispatcher never needs the service URLs back.** Apprise stores what a key
  points at; the dispatcher only sends a key and a rendered message. The decrypt
  capability therefore never leaves the control-plane process — the only one
  holding the server identity.

## What a notification looks like

The dispatcher renders a template per event type and appends the same context the
webhook payload carries:

```
Actor approved: edge-sensor-04

Kind: sensor
Workspace: default
Granted: process_read
By: admin test
View: https://controlplane.example.com/admin/actors/…
```

For an update event, the field-level diff is rendered too:

```
Changes:
  description: test → audit-log-verification
```

A null or empty value renders as `(none)`, so a rendered diff never shows a bare
empty string that reads like a formatting bug.

An event with **no template** is skipped rather than sent blank.

## Requirements

| Requirement | Effect if missing |
|---|---|
| `APPRISE_API_URL` | The entire notification path is skipped. Webhook delivery is unaffected. |
| `REDIS_URL` | Nothing is enqueued at all — both notifications and webhooks are off. |
| A running dispatcher | Events enqueue and sit there. Check the health panel. |

## Known limitation

**Notification-channel delivery failures are not dead-lettered.** Webhook failures
are. If Apprise is down when an event fires, that notification is lost rather than
retried.

This is documented rather than hidden because the alternative — a channel that
looks like it delivered and did not — is worse than a channel you know can drop.

## Choosing between webhooks and channels

| Use a webhook when | Use a channel when |
|---|---|
| A system consumes it | A person reads it |
| You need the full structured payload | You need a title and a body |
| You need signature verification | Apprise already integrates the destination |
| You need retry and dead-lettering | Best-effort is acceptable |

Subscribing both to the same event is normal and expected.
