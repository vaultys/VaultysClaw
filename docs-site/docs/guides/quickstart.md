---
sidebar_position: 1
title: Quickstart
description: Run the rebuilt control plane locally, become the first admin, and onboard your first Actor.
---

# Quickstart

Goal: a running control plane, an admin identity, and one connected Actor holding
a real certificate. About ten minutes.

## Prerequisites

- Node 18+ and pnpm
- Docker (Postgres, Redis, Apprise)

## 1. Install and start the stack

```bash
pnpm install
```

```bash
pnpm controlplane:dev
```

That starts the backing services — Postgres on 5433, Redis on 6381, Apprise on
8000 — waits for them to report healthy, then runs the control plane's dev server
on **http://localhost:3001**.

To start the infrastructure alone:

```bash
pnpm controlplane:docker:up
```

These ports deliberately differ from the older control plane's (3000/8080/5432/
6380), so both can run side by side.

:::note Redis and Apprise are optional
Postgres is required. With `REDIS_URL` unset, webhooks and notification channels
silently no-op rather than breaking anything. With `APPRISE_API_URL` unset,
notification channels are off and webhooks are unaffected.
:::

## 2. Become the first admin

Open **http://localhost:3001** and sign in.

**With a wallet:** scan the QR code with the VaultysId wallet app.

**Without one:** click *"Connect without the app (dev mode)"* — available only on
a non-production build — and generate a software identity. You can generate
several and switch between them, which is how you test as more than one human.

Either way, because no Actor anywhere holds `admin_console_access` yet, the
control plane issues you a bootstrap admin certificate automatically. You land on
`/admin`.

See [Bootstrapping the first admin](/docs/guides/bootstrap) for what just happened
and why the resulting certificate is flagged the way it is.

## 3. Start the event dispatcher

Events only reach webhooks and notification channels if a dispatcher is consuming
the queue. In a second terminal:

```bash
pnpm controlplane:webhook:dev
```

Without it, events enqueue correctly and then sit there forever. The Integrations
health panel checks for a live consumer specifically because Redis being reachable
does not answer that question.

:::warning Known issue in the dev script
`controlplane:webhook:dev` currently points `DATABASE_URL` at port **5432**, while
the dev stack runs Postgres on **5433**. Until that is fixed, override it:

```bash
DATABASE_URL=postgresql://vaultys:vaultys_dev_secret@localhost:5433/vaultysclaw pnpm controlplane:webhook:dev
```
:::

## 4. Onboard an Actor

Any process implementing the handshake works. The Go sensor is the easiest real
one, and it exercises the capability gate end to end.

Point it at `ws://localhost:8081`, start it, and it will register and report
pending. Then in the console:

1. **Actors** shows the pending registration with its DID and requested
   capabilities.
2. Approve it, choosing the capabilities to grant — you may grant **fewer** than
   were requested.
3. The control plane sends `auth_complete`, then runs a live certificate exchange
   over the same connection.
4. **Certificates** now shows a real, independently verifiable grant.

Watch the sensor's own log to see the gate open: it reports skipping its poll
cycle until `process_read` is granted, then begins polling in the same second the
exchange completes.

See [Onboarding actors](/docs/guides/onboarding-actors).

## 5. Look around

| Where | What to look at |
|---|---|
| **Certificates → detail** | Decoded payload, both signatures, which key verified which half, live re-verification |
| **Audit Log** | The registration, approval, and issuance you just performed, with field-level diffs |
| **Sensors** | Observed workloads on the host, classified managed / observed / shadow |
| **Overview** | Posture summary and a live activity feed |

## Next

- [Deployment](/docs/guides/deployment) — environment variables and production shape
- [Issuing certificates](/docs/guides/issuing-certificates) — including scoped, short-lived grants
- [Inviting humans](/docs/guides/human-onboarding) — invitations and SSO
- [The Zero Trust matrix](/docs/zero-trust/matrix) — what this does and does not give you
