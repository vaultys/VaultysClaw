---
sidebar_position: 9
title: Sensors & shadow AI
description: Deploy the endpoint sensor to discover what AI is actually running on your hosts, and correlate it against the ledger.
---

# Sensors & shadow AI

Your certificate ledger tells you what AI you have **sanctioned**. A sensor tells
you what is actually **running**. The gap between those two lists is shadow AI,
and finding it is the sensor's whole purpose.

## What it does

A Go daemon on a host. It polls process and socket state, correlates by PID, and
classifies workloads as AI or agent software using **data-driven rules from its
own configuration** — provider endpoints, local runtimes, MCP servers, agent
frameworks, browser process names.

Telemetry is graded, not binary: a confidence score for "is this AI", another for
"is this an agent", and the reasons behind each. An operator can see *why*
something was classified, not just that it was.

Observations are stored as **current state**, upserted per workload, not appended
as a log — matching the sensor's own report-deltas model.

## It reads nothing until permitted

The sensor checks `process_read` at the top of every poll cycle:

```
sensor: skipping poll cycle — process_read capability not yet granted
…
vconn: certificate delivered
sensor: poll cycle
```

Before the certificate arrives it touches no process information at all. This has
been verified against a real binary rather than asserted — it is the clearest
demonstration in the system that a capability gate opens exactly when, and not
before, the control plane grants it.

## Managed, observed, shadow

The classification that makes this governance rather than monitoring:

| Status | Meaning |
|---|---|
| **Managed** | The workload's identity evidence resolves to a real Actor in the ledger |
| **Shadow** | No resolving evidence, above the confidence threshold — **unmanaged AI** |
| **Observed** | No resolving evidence, below the threshold |

Three properties keep this honest:

- **The sensor decides nothing.** Correlation happens control-plane side, against
  the live ledger.
- **Evidence naming a nonexistent or revoked DID falls through to shadow**,
  exactly as if there were no evidence at all. A stale claim is not a credential.
- **A sensor's own DID never counts as managing** a workload it observed on
  itself.

Sensor-side, evidence comes from an operator-configured path pointing at a real
agent's identity file, attached only to workloads matching a known agent
framework.

## Deploying one

1. Build or fetch the binary.
2. Write a config — control plane WebSocket URL, device name, scan interval,
   identity path, and optionally the agent identity path used as evidence.
3. Start it. It registers and reports pending.
4. Approve it in the console with `process_read`.

Default config location is `~/.vaultysclaw-sensor/config.yaml`.

Classification rules live in that config as data, not code, so tuning what counts
as an agent framework or an MCP server does not require rebuilding.

## Reading the results

**Sensors** shows the fleet: sensor count, how many are online right now — read
from the live connection map, not a stored field — and total versus shadow
workload counts. A managed count sits alongside them.

Per device, a workload table with a status pill per row, and for a managed
workload, a link to the Actor that manages it.

## Relationships

There is no "assigned user" field. A sensor's owner or relationship is an
`ActorLink` — a freely-labelled directed edge — edited from the Actor detail page
and shown read-only on the sensor list. Deliberately generic, because a
single-purpose relation needs replacing the moment a second use case appears.

## Upgrading a sensor to an interception point

Same binary. Enable the `intercept` block in its config and it registers as
`proxy` instead — and starts **refusing** traffic rather than only reporting it.

That is a different operational posture and a different risk profile. Read
[Blast radius](/docs/concepts/blast-radius#3-network--the-interception-point)
first, particularly:

- an interception point governs a **zone**, not an agent;
- every startup failure is **fatal by design** — it refuses to start rather than
  starting permissively;
- `maxStatusAgeSeconds: 0` is the **strictest** setting and denies everything for
  an offline decider; unbounded must be written as a negative;
- there is **no admin panel** for a proxy's configuration yet — it must be written
  directly to the Actor record.
