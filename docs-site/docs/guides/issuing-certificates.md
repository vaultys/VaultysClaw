---
sidebar_position: 4
title: Issuing & revoking certificates
description: Issue standing and scoped grants, inspect what was actually signed, and revoke with effect.
---

# Issuing & revoking certificates

Everything on this page happens under **Certificates** in the admin console.

## Issuing a grant

The issuance form asks for four things.

### Subject

Any Actor — human or not. The picker groups by category, because granting
`admin_console_access` to a human and `file_read` to an agent are the same
operation on the same ledger, and the UI should not pretend otherwise.

### Capabilities

Filtered by the subject's kind. `delegation` is deliberately never offered:
exposing it would let an admin fabricate a certificate claiming delegation
guarantees it does not have.

`non_delegatable` **is** offered, and is live today. A certificate carrying it can
never be a delegation chain's parent — the whole certificate, not per-capability.

### Scope

Optional. Leave it empty for a plain capability grant; fill it to narrow the grant
to a resource, a pattern, a use count, or a stated purpose.

```
resource:        file:///reports/q3.pdf
resourcePattern: file:///reports/*
maxUses:         1
purpose:         quarterly-report-export
```

`purpose` is a free-text audit tag. Use it — it is what turns a log line from
"this Actor held file_read" into "this grant was issued for the Q3 export".

Where a scope names a host, remember that matching is exact or dot-prefixed
suffix, **never substring**. See
[Capabilities → host matching](/docs/concepts/capabilities#host-matching-precisely).

### Expiry

Presets, or a specific timestamp, or **Never**.

:::caution "Never" requires an explicit confirmation
A no-expiry grant is valid until someone revokes it. The form makes you tick a
confirmation checkbox, and the resulting row renders its expiry in warning amber
throughout the console. That friction is intentional — the canonical legitimate
use is the bootstrap admin grant, and a second one should be a conscious decision.
:::

## Short-lived scoped grants

This is the just-in-time pattern, and it is an ordinary ledger row:

| Field | Value |
|---|---|
| Capabilities | `file_read` |
| Scope | `resource: file:///reports/q3.pdf`, `purpose: q3-export` |
| Expiry | ten seconds from now |

Auditable, revocable, and citable like anything else — just very short-lived. It
is excluded from proactive renewal, deliberately: a grant for one action in the
next ten seconds should expire and disappear, not be silently refreshed.

The mechanism is complete. What does not exist yet is an automated requester — an
agent asking for one mid-task without a human clicking approve.

## Workspace-scoped grants

From a workspace's **Access** tab, the "grant access" action deep-links into the
issuance form with the resource field pre-filled as `workspace:<id>`.

That is how workspace membership is expressed: not a membership table, but
certificates whose scope names the workspace. "Who has access here" is a ledger
query, so it cannot disagree with the ledger.

## Inspecting what was signed

Open any certificate's detail page. It shows:

- the **raw and decoded** payload — for the system-issued format, both the grant
  and the embedded request;
- **which key actually verified** each signature;
- an **independent live re-verification** run against the stored bytes, not a
  stored validity flag;
- the **status-check history** — every party that has asked about this
  certificate, and when.

For a system-issued grant, the honest signal is that both halves verify against
the *same* key: nobody outside asked for this, an admin decided it directly. For
an interactively issued grant, two distinct keys verify, proving both parties were
present.

Rows predating public-key capture show "could not verify" gracefully rather than
claiming a verification that did not occur.

## Revoking

Inline from the list or from the Actor's detail page. **A reason is required.**

What happens:

1. The row's status flips to `revoked`, with the reason, the revoking admin, and a
   timestamp. The row is never deleted.
2. Every status check from that moment returns `revoked`, to every party —
   including the control plane's own dispatcher.
3. A cooperative push is attempted to the Actor, which it may honour.

:::tip Step 3 is the courtesy; step 2 is the control
A modified binary can ignore the push. It cannot make a signed status response say
`active`. This is the difference between revocation as a hopeful notification and
revocation as an authoritative fact — see
[Trust verification](/docs/concepts/trust-verification).
:::

Revocation takes effect on the next check. What "next" means for a given verifier
depends on the trust policy: a live-checking verifier sees it immediately, an
offline decider sees it when its artefacts next refresh, bounded by its configured
maximum status age.

## Narrowing rather than revoking

Revoke and re-issue. The ledger supports supersession — a new certificate can
record the one it replaces — which keeps the chain legible to an auditor rather
than leaving an unexplained gap.

## Events

`certificate.issued` and `certificate.revoked`, both carrying the acting admin and
the full sanitised payload — never the certificate bytes themselves.
