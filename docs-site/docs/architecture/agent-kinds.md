---
sidebar_position: 3
title: Agent kinds
description: What each Actor kind is, what configuration it carries, and what it can be granted.
---

# Agent kinds

A **kind** is a deploy-time concept: adding one means adding a configuration
schema and an admin panel component, not a database table, not a registration
flow, and not a permission model.

Three of the kinds below — `sensor`, `proxy` and `harness` — are the *same Go
binary* in different roles, and which role it runs decides how it registers.
Observe-only registers as `sensor`; turning on interception makes it a `proxy`;
supervising a coding harness makes it a `harness`. Enabling a role is always a
deliberate act, never a consequence of upgrading.

Everything below shares, unconditionally: one registration handshake, one approval
flow, the same certificate ledger, the same status-check protocol, and the same
audit trail.

## `openclaw` — LLM-driven agent

The reference agent. Built on `@vaultysclaw/agent-runtime` with an LLM engine,
tool execution, and skills layered on top.

| | |
|---|---|
| **Implementation** | `@vaultysclaw/agent-controller` |
| **`kindConfig`** | LLM provider and model, knowledge sources, skill overrides |
| **Capabilities** | The full agent list |
| **Admin panel adds** | Token consumption, knowledge source management, connect-to-chat |

Its policy enforcer gates every intent in order: capability check → certificate
expiry → daily token budget → hourly request rate. Note that this enforcement runs
**inside the agent process** — it is a real control for a cooperating agent and no
control at all against a modified binary. That asymmetry is why the interception
point exists.

## `mcp` — Model Context Protocol server

An MCP server registered as an Actor, so the tools it exposes sit inside the same
trust model as everything else.

| | |
|---|---|
| **Implementation** | `@vaultysclaw/mcp-gateway` |
| **`kindConfig`** | Server URL, tool allow-list, transport (stdio or SSE) |
| **Capabilities** | The full agent list |
| **Admin panel adds** | Standard MCP configuration fields, exposed tool list |

## `sensor` — endpoint observation

A Go daemon that watches a host and reports what AI and agent software is actually
running on it. **Enforces nothing.**

| | |
|---|---|
| **Implementation** | `vaultysclaw-sensor` (Go), observe role |
| **`kindConfig`** | Host metadata merged from telemetry — hostname, OS |
| **Capabilities** | `process_read` only |
| **Admin panel adds** | Workload table with per-workload status |

### What it reports

It polls process and socket state, correlates by PID, and classifies workloads
against **data-driven rules in its own config** — provider endpoints, local
runtimes, MCP servers, agent frameworks, browser process names. Telemetry is
graded, not binary: confidence scores for "is this AI" and "is this an agent",
plus the reasons behind each score.

Observations are upserted as **current state**, not appended as a log, matching
the sensor's own report-deltas model.

### Managed, observed, shadow

The classification that makes this a governance tool rather than a monitoring one:

| Status | Meaning |
|---|---|
| **Managed** | The workload's identity evidence resolves to a real Actor in the ledger |
| **Shadow** | No resolving evidence, above the confidence threshold — unmanaged AI |
| **Observed** | No resolving evidence, below the threshold |

The sensor decides none of this. Evidence naming a nonexistent or revoked DID
falls through to shadow, exactly as if there were no evidence at all. A sensor's
own DID never counts as managing a workload it observed on itself.

Sensor-side, the evidence comes from an operator-configured path pointing at a
real agent's identity file, attached only to workloads matching a known agent
framework.

### Capability gating is real here

The sensor checks `process_read` at the top of every poll cycle. Before the
certificate arrives it reads **no process information at all** — verified against
a real binary, not asserted.

## `proxy` — enforcing interception point

The same Go binary with interception active. This is the only kind that
**enforces** rather than reports, which is why its badge is danger-coloured.

| | |
|---|---|
| **Implementation** | `vaultysclaw-sensor` (Go), intercept role |
| **`kindConfig`** | `mode`, `listenAddr`, `rules` (the signed rule set), `maxStatusAgeSeconds` |
| **Capabilities** | Standard agent list |
| **Admin panel adds** | Mode and freshness settings, the rule list with add/delete, and whether a change has actually reached the point or is waiting for a reconnect |

Full treatment in [Blast radius](/docs/concepts/blast-radius#3-network--the-interception-point).

Configuration reaches it through `actor_config`, a deliberately kind-agnostic
message carrying the config, a grant token, a signed rule-set token, and the trust
posture. The stored config copy is left **unsigned** on purpose: a stored
signature would need regenerating on every edit, and a stale signature is
indistinguishable from a tampered one. The signature that makes rules enforceable
is produced at push time.

## `harness` — supervised coding harness

The same Go binary again, in its third role: **supervise**. It launches a coding
harness — Claude Code today — and decides *every tool call* locally from a signed
grant and a signed rule set, with no control-plane round trip.

| | |
|---|---|
| **Implementation** | `vaultysclaw-sensor` (Go), supervise role |
| **`kindConfig`** | `mode`, `sandbox`, `resourceRules`, `maxStatusAgeSeconds` |
| **Capabilities** | Standard agent list |
| **Admin panel adds** | Mode and confinement settings, the resource-rule list, and delivery state |

Deliberately shaped as the proxy's sibling: same unsigned-in-the-database storage,
same sign-at-push-time rule set, same `maxStatusAgeSeconds` semantics. The two
differ in exactly one thing — **a proxy governs network destinations, a harness
governs resource URIs** — which is why they carry different halves of one signed
rule-set format rather than two formats.

### Two settings decide whether anything is actually enforced

| `mode` | Behaviour |
|---|---|
| `observe` | Every tool call is decided and recorded. **Nothing is refused.** The default, and it should stay the default on a new deployment: the resource strings this role produces end up inside signed certificates, so they are learned from real traffic before being frozen. |
| `explicit` | Anything no certificate covers is refused. |

| `sandbox` | Behaviour |
|---|---|
| `off` | Never attempts OS confinement. |
| `auto` | Confines where it can, warns loudly where it cannot. |
| `require` | **Refuses to launch** where confinement cannot be established, rather than continuing in advisory mode. The setting for an operator who actually depends on it. |

Without OS confinement, even `explicit` is **advisory** — a subprocess, or an
edited harness config, bypasses the hook. The admin panel says so on the page,
because both halves of that sentence produce a deployment that looks governed and
is not.

`vaultysclaw-sensor sandbox-check` proves confinement is really in force for a
given floor, and `vaultysclaw-sensor report` shows what supervised sessions did
and the scope they would need — which is how an `observe` deployment learns the
rules before switching to `explicit`.

### This one usually runs on a person's laptop

Unlike a proxy in a rack, a harness supervisor sits on someone's machine, and a
rule written here can stop them working. That is a governance property, not a
detail: the blast radius of a bad rule is a developer who cannot run their tools.

## `device` — browser, computer, or server

Registers exactly like any other kind — no protocol change was needed, because the
registration flow was already kind-agnostic.

| | |
|---|---|
| **`kindConfig`** | Nothing today |
| **Capabilities** | The standard agent list |

Its point is `Actor.ownerDid`: recording that this device belongs to, and will
eventually act for, a particular human or agent. That relation is **descriptive
only** today — it grants nothing, and permission resolution does not consult it.
The mechanism that would make it act for its owner is
[delegation](/docs/zero-trust/roadmap#delegation-chains), which is designed and
not built.

## `human`

The one kind onboarded through login rather than the registration handshake. See
[Actors](/docs/concepts/actors#humans-are-actors).

## Adding a kind

1. Define the `kindConfig` shape and a validator that **rejects** malformed
   configuration rather than dropping it.
2. Register the kind's metadata — label, category, badge.
3. Decide its capability allow-list, or accept the agent default.
4. Add an admin panel component if it needs one.

No Prisma model. No registration flow. No parallel approval UI. The registration
payload's `kind` field is open-ended, and an unrecognised kind renders gracefully
rather than crashing.
