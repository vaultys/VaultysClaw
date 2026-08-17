---
sidebar_position: 3
title: What was removed, and why
description: The rebuild deleted a large amount of product surface. Here is what went, what replaced it, and what is not coming back.
---

# What was removed, and why

The rebuilt control plane is not a refactor of the proof-of-concept. It is a
ground-up rebuild around a much narrower scope, and it **deleted** rather than
reimplemented a large part of the previous product.

Nothing needed a deprecation period: no production traffic depended on any of it.

## The principle

**Do less, better.** VaultysClaw's job is agent identity and trust. Everything
below was either better served by a tool built for it, or existed only to support
something else on this list.

A secondary principle, applied throughout: **delete code rather than patch it**.
Several concrete security holes — a stubbed signature verifier that always
returned true, plaintext bridge secrets — were closed by removing the feature that
contained them, not by fixing it.

## What went

### Workflow engine

Executor, scheduler, approvals, runs, steps. Deferred to n8n or similar.

Orchestration is a solved problem with mature tools. Re-implementing a smaller,
worse version of one was not a good use of the platform's scope, and the
orchestrator does not need to be the same system as the trust plane — an n8n
instance can be governed as an Actor like anything else.

### Channels, chat, threads, mentions

The entire collaboration surface. It existed so humans could converse with agents
conversationally, and it went with the end-user product.

**Partially replaced** by the [Access Portal](/docs/architecture/control-plane#access-portal):
a certificate viewer plus a launch point. Any human holding a connect grant can
reach the agent that grant names — what "connecting" means is owned by that
agent's kind. That is narrower than the channel system on purpose, and it is not a
staging post back toward it.

### Teams and generic bridges

Existed only to sync the channel system externally. Removed with it — which also
removed a stubbed request verifier that always returned true and a set of
plaintext-stored bridge secrets.

### In-app, email, and push notifications

The whole notifier package, notification rows, and per-user preferences. There is
no general end-user population to show a bell to.

**Replaced** by [notification channels](/docs/guides/notification-channels):
operator-facing alerts through a self-hosted Apprise container, driven by the same
event pipeline as webhooks.

### The end-user settings area

Profile, security, appearance, notification preferences. **Partially replaced** by
a first-login profile prompt and the Access Portal.

### The ts-rest REST API

Every REST route, the contract layer, and the hashed bearer-token API keys.

**There is currently no REST API surface at all.** The admin console is Server
Actions over data-access objects. The
[replacement design](/docs/zero-trust/roadmap#rest-api-on-vaultysid) is a service
DID holding a scoped certificate and signing each request — not a bearer token
that works for whoever holds it.

:::note Why the old API keys were not ported
Beyond the design difference: the previous package's API-key administration
routes never called the authorisation helper at all, and were therefore
unauthenticated. Porting them would have carried that across. Whoever builds the
replacement should start from the design, not from that code.
:::

### Three parallel grant models

User grants, delegation certificates, and agent peer grants — three models each
implementing a variation of "grant a subset of capabilities to someone, signed,
with expiry", each with its own revocation and expiry logic.

**Collapsed into one thing**: a `CapabilityCertificate` row. A human delegating
scoped access to another human, or an agent granting a peer access, is the same
artefact — the subject is any Actor's DID, and the scope expresses the narrowing.
One ledger, one status protocol, one audit trail, instead of four models each
needing their own.

### The role enum

Owner, Admin, Member. **Replaced** by capabilities in the same ledger:
`admin_console_access`, `portal_access`. One fewer parallel system, and one more
thing auditable through the single ledger rather than a role table off to the
side.

### Two separate device models

`Agent` and `SensorDevice` were two Prisma models with two admin pages and two
structurally identical registration flows. **Collapsed** into
[`Actor`](/docs/concepts/actors), with kind-specific configuration in one JSON
column.

### Two separate audit logs

An intent log and an activity log. **Merged** into one, since there is no separate
"intent execution" concept to track.

## What was explicitly kept

- **The VaultysId crypto layer** — passwordless QR login, the `Challenger`
  handshake, the certificate primitives. This was never the problem.
- **Workspaces** — still the tenancy boundary, scoped now to certificates,
  budgets, and model access rather than also workflows and channels.
- **OIDC and Entra ID** — as identity-*establishment* paths that bind to a DID,
  never as a parallel trust tier.
- **The model registry and LiteLLM routing.**
- **The credentials vault** — extended to cover Apprise service URLs, replacing
  the inconsistent plaintext path the bridges used.
- **Webhooks** — kept as core, and extended to carry what used to be
  notifications.

## Connecting was never in scope for removal

Every reduction is about *what the interface does once you are connected*, never
*how you connect*.

The passwordless VaultysId QR login stays exactly as it was. No
username-and-password fallback was introduced just because the audience narrowed
to operators — the point of the rebuild is fewer surfaces with **more** trust
rigour, not less. The agent registration and certificate handshake is likewise
untouched: the Actor model changes what happens *after* a successful handshake,
never the handshake itself.

## Coexistence

The rebuilt control plane lives **alongside** the older one in the same
repository. Nothing points production traffic at the rebuild until a cutover is
deliberate. They use different ports and different databases, and can run side by
side.

Docs on this site describe the **rebuilt** control plane. Where the older
package's documentation disagrees, this site wins.
