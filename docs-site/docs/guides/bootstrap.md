---
sidebar_position: 2
title: Bootstrapping the first admin
description: How the first admin certificate is issued when no admin exists yet, and why it is deliberately loud.
---

# Bootstrapping the first admin

Gating admin access behind a certificate creates a chicken-and-egg problem.
Issuance normally requires an existing admin to approve a request, and on a fresh
deployment there is not one.

## The exception

On the **first** human login where no Actor anywhere in the ledger holds an
active `admin_console_access` certificate, the control plane issues one to that
DID:

- no approval step;
- attributed to `system:bootstrap`;
- **no expiry** — a standing grant, valid until explicitly revoked.

It fires **at most once per deployment**. The existence check runs every time, so
the moment any `admin_console_access` certificate exists — bootstrap or
otherwise — every later registration falls through to the normal approval flow.

## The race is closed properly

The existence check and the insert are atomic. A fixed certificate id doubles as
the lock: whichever path wins it is the only one that succeeds. Two humans
registering inside the same race window cannot both walk through the gap.

All three issuance paths — the wallet path, the dev-mode path, and direct admin
issuance — share that same guard.

## It is deliberately loud

A no-expiry, system-issued grant is exactly the kind of thing that should not
quietly persist for two years. So:

- it lands in the Certificates ledger **flagged as standing, no-expiry, and
  system-issued**;
- "Never" renders in **warning amber**, never as neutral text;
- the first real admin sees it immediately and can consciously reissue with an
  expiry if they want a stricter posture.

Loud, not silent, is the rule for this whole class of exception. See
[Certificates → expiry](/docs/concepts/certificates#expiry).

## Two transports, two mechanisms

Which mechanism runs depends on how you connect, because a third-party wallet app
cannot be assumed to understand a follow-up challenge.

### Wallet (QR / PeerJS) — single exchange

The wallet completes the login handshake. The control plane then issues the
bootstrap certificate directly as a **system-issued** grant — the format used
whenever there is no live counterpart able to hold up its end of a second
exchange.

### Dev mode — double exchange

The dev-mode transport is code this repository owns end to end, so it can do
better. It runs **two independent handshakes**:

1. `service: "auth"` — connect and register.
2. `service: "certificate"` — actually claim `admin_console_access`.

The result is a natively dual-signed certificate rather than a system-issued one:
both parties cryptographically present at the moment of issuance. The second round
runs transparently before sign-in ever fires, so there is no window where you are
signed in without the grant.

A failed certificate round does not block sign-in. The idempotent bootstrap check
simply offers a fresh round on the next login attempt.

## After bootstrap

The bootstrap admin can:

- approve pending Actor registrations;
- issue certificates to anyone, including `admin_console_access` to a second
  human — do this before you lose the first identity;
- invite humans directly;
- revoke the bootstrap certificate itself, once a replacement admin exists.

:::caution There is no recovery path
Authority lives in the ledger, keyed to DIDs. If every DID holding
`admin_console_access` becomes unavailable — lost wallet, cleared browser
storage — nothing in the application can restore access, because there is no
password to reset and no support account with standing authority.

Issue a second admin certificate to a separate identity as your first
administrative act, and back up the server identity. See
[Deployment](/docs/guides/deployment#backups-and-recovery).
:::

## Verifying it worked

The Certificates page should show one row: your DID, `admin_console_access`,
issued by `system:bootstrap`, expiry "Never" in amber. Open its detail page — the
decoded payload and an independent live re-verification are shown there, so you
can confirm the artefact is genuinely valid rather than merely present.
