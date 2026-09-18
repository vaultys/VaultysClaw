---
sidebar_position: 7
title: Kill switches
description: Suspend every grant org-wide or for one workspace — reversibly, without revoking anything.
---

# Kill switches

A kill switch is the **reversible** emergency control. It suspends every
certificate it covers, immediately, and puts them all back when you disarm it —
with no certificate re-issuance and no new handshake per Actor.

It sits alongside [revocation](/docs/guides/issuing-certificates#revoking), which
stays one-way: coming back from a real revoke means issuing a new certificate.

## Which one do I want?

| | Kill switch | Revocation |
|---|---|---|
| Scope | Everything in the org, or everything in one workspace | One certificate |
| Ledger | **Nothing is written** — suspension is computed at decision time | An append-only row change |
| Undo | Disarm, and every covered grant authorises again | None — issue a new certificate |
| Use it for | "Stop everything now, we are investigating" | "This grant was wrong and should never return" |

If you are unsure during an incident: **arm the switch**. It is the one of the two
you can take back.

## Arming

- **Org-wide** — Settings → Kill switch.
- **One workspace** — Workspaces → *the workspace* → Settings tab.

Both ask for two things: a **reason**, and the word `ARM` typed to confirm. The
reason is not decoration — it is carried to covered Actors, so a client logs *why*
it was cut off, and it appears in the audit log and in the `killswitch.armed`
alert.

The confirmation is a short fixed word rather than the workspace's name on
purpose. This is an emergency control; the confirmation exists to stop a misplaced
click, not to slow down a real incident.

## What actually happens

While a switch is armed and covers an Actor:

1. **Its certificates answer `revoked`** on any status check. The signed
   `cert_status_response` — not the stored row — is what a holder keeps, so this
   is the authoritative effect and it reaches cooperating verifiers on their next
   refresh.
2. **Its handshake is refused**, carrying your reason. It cannot connect, and
   therefore cannot query anything further until you disarm.
3. **Already-connected covered Actors are pushed a `kill_switch` message** and
   then disconnected, so they stop authorising immediately rather than waiting for
   a refresh.
4. **New certificates cannot be issued** to a covered Actor — an issuance attempt
   is refused rather than minting a ledger row that authorises nothing.

The certificate rows themselves stay `active` throughout. That is deliberate: the
ledger keeps telling the truth about what was issued and revoked, while the live
authorisation answer changes.

:::note No fifth status
A suspended certificate is *signed* as `revoked`, reusing the existing closed
four-value status union. Nothing on the client side — SDKs, offline verifiers,
the Go implementation — needs to learn a new state to honour a kill switch.
:::

## Coverage

A **global** switch covers every non-human Actor. A **workspace** switch covers a
certificate three ways:

- the certificate's own workspace,
- a scope of `workspace:<id>`,
- or the **holder's** own workspace assignment.

The third is a deliberate widening: a kill switch should over-include. (Workspace
deletion, which is irreversible, under-includes for the same reason.)

An armed global switch short-circuits every workspace — for an emergency brake,
the most restrictive scope wins. This is the **opposite** of
[trust policy](/docs/concepts/trust-verification#trust-policy-fail-mode-and-staple-ttl),
where the most specific scope wins because it is configuration, not a brake.

## Humans are always exempt

`admin_console_access` is itself an ordinary capability carried by a certificate,
and the console is the only place a switch can be disarmed. If humans were
covered, arming the global switch would lock every administrator out of the only
UI that can undo it.

This is a load-bearing exemption, not a convenience: a human Actor is skipped
before any other check runs.

:::caution Sensors go dark too
Refusing the handshake also cuts off `sensor` Actors, so workload telemetry stops
for as long as the switch is armed — you lose visibility during exactly the
incident that made you arm it.

That was the deliberate choice: a kill switch that leaves a covered Actor
connected is a weaker switch. A deployment that would rather keep the telemetry
can exempt sensors in one place.
:::

## Disarming

Disarm from the same panel. The switch row is deleted — armed means the row
exists, disarmed means it is gone — and every covered grant authorises again with
no re-issuance.

Covered Actors reconnect on their own: the SDK's reconnect backoff makes recovery
automatic, with no admin action beyond disarming.

Arm/disarm history lives in the [audit log](/docs/concepts/audit-log) and in the
`killswitch.armed` / `killswitch.disarmed`
[events](/docs/reference/webhook-events#kill-switches), not in the switch row
itself.
