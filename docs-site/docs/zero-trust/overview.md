---
sidebar_position: 1
title: Zero Trust for AI Agents
description: How VaultysClaw maps onto Anthropic's Zero Trust for AI Agents guidance, and how we keep the assessment honest.
---

# Zero Trust for AI Agents

Anthropic's **"Zero Trust for AI Agents"** guidance adapts classical Zero Trust —
*never trust, always verify* — to a setting where the thing being verified is a
non-deterministic, tool-using, network-connected process acting on a human's
behalf. It organises the problem into twelve control domains, each with three
tiers of maturity: **Foundation**, **Enterprise**, and **Advanced**.

VaultysClaw is built against that framework, and this section is our
self-assessment against it.

## Why we publish the assessment

Every agent platform claims to be Zero Trust. The claim is close to meaningless
unless it comes with a per-domain breakdown that includes the failures. So the
[matrix](/docs/zero-trust/matrix) states, for each of the twelve domains, what is
built, what is partial, and what is absent — including the two domains where
VaultysClaw currently scores **zero at every tier**.

Three rules keep it honest:

1. **A control counts only if it is enforced, not merely recorded.** The Model
   Registry records which workspaces may use which model; nothing stops an
   inference call at runtime. That is recorded, not enforced, and the matrix says
   so rather than counting it.
2. **A control counts only if it has been exercised.** Claims marked *verified*
   were run end to end against real infrastructure — a real Postgres, a real Go
   sensor binary, a real Apprise container, Microsoft's real discovery document —
   not type-checked and assumed.
3. **Scope is stated.** Several domains (agent memory, output filtering, tool
   sandboxing) are properties of the *agent runtime*, not the control plane. The
   matrix marks these as inherited rather than silently claiming credit for
   something a different process is responsible for.

## What Zero Trust means concretely here

The classical Zero Trust posture is *authenticate every request, authorise every
request, assume breach*. VaultysClaw's interpretation of each, for agents:

### Authenticate every party, not every message

Every Actor — agent, sensor, proxy, device, human — proves possession of a
VaultysId private key through an SRP-style `Challenger` handshake at connection
time. There are no bearer tokens for agents, no shared secrets, and no long-lived
API keys that work for whoever holds them. The public key observed during that
handshake is persisted, so any later artefact signed by that Actor can be
re-verified offline, with no live connection.

See [Actors](/docs/concepts/actors) and the
[WebSocket protocol](/docs/reference/websocket-protocol).

### Authorise from a signed, revocable artefact — not a role

There is no role table. An Actor's permissions are the union of the
`CapabilityCertificate` rows currently naming it as subject: each one signed,
time-boxed, optionally narrowed by a scope, and individually revocable. Whether a
human can open the admin console is decided the same way, by the same code path,
as whether an agent may read a file.

See [Certificates](/docs/concepts/certificates) and
[Capabilities & scope](/docs/concepts/capabilities).

### Assume the agent is lying

This is the assumption that shapes the architecture more than any other.
VaultysClaw does not control code running on remote infrastructure, so it cannot
guarantee a revoked agent stops acting — a modified binary can ignore any
revocation pushed to it.

What it *can* guarantee is that **nobody legitimate acts on a revoked agent's
behalf without knowing it is revoked**. Every interaction is gated behind a live
or stapled check against the ledger, performed by whoever is about to extend
trust — not by the agent asserting its own good standing.

See [Trust verification](/docs/concepts/trust-verification).

### Contain the blast radius by identity, not only by network

Workspaces bound tenancy. Capability allow-lists bound what a kind of Actor may
even be granted. And for the network dimension, the `proxy` Actor kind is an
interception point that refuses agent traffic its certificate does not
authorise — enforcement, not observation.

See [Blast radius](/docs/concepts/blast-radius).

### Make the audit trail the same data as the alerts

One `recordEvent()` call writes the append-only audit row *and* drives the
webhook/notification pipeline, so the trail an auditor reads and the alert an
operator receives can never describe different events.

See [Audit log](/docs/concepts/audit-log).

## Reading the matrix

| Marker | Meaning |
|---|---|
| **Built** | Implemented and exercised end to end. |
| **Partial** | The mechanism exists but does not yet cover the domain, or is recorded but not enforced. |
| **Design** | Specified in a committed design doc with schema/type support landed, but no code path produces or consumes it yet. |
| **Absent** | Not present. No partial credit. |
| **Inherited** | A property of the agent runtime or an external component, not the control plane. |

Continue to **[the matrix](/docs/zero-trust/matrix)**.
