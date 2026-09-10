---
sidebar_position: 9
title: Sensors & shadow AI
description: Deploy the endpoint sensor to discover what AI is actually running on your hosts, and correlate it against the ledger.
---

# Sensors & shadow AI

Your certificate ledger tells you what AI you have **sanctioned**. A sensor tells
you what is actually **running**. The gap between those two lists is shadow AI,
and finding it is the sensor's whole purpose.

One binary, three roles, each opt-in: **observe** (this page), **intercept** —
refusing network traffic — and **supervise** — governing a coding harness's tool
calls. Observe is what you get by default; the other two are covered at the end.

## What it does

A Go daemon on a host. It polls process and socket state, correlates by PID, and
classifies workloads as AI or agent software using **data-driven rules from a
catalog file** — five of them: provider endpoints, installed AI applications,
local model runtimes, MCP servers, and agent frameworks.

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

## Detection rules are a file, including the defaults

What the sensor recognises as AI is data, not code — on both sides:

| | |
|---|---|
| **Built-in rules** | `internal/config/default-catalog.yaml`, embedded in the binary. Changing it changes what the project ships. |
| **Your catalog** | `catalogPath`, default `~/.vaultysclaw-sensor/catalog.yaml`. Merged **additively** over the built-ins. |

Additively is the important word. A file listing one new provider adds one
provider — it does not discard the rest of the catalog, which is what a plain
YAML key would do. Reusing a built-in rule's name
**extends** that rule, so you can add a regional endpoint to `openai` without
restating its other hosts; `disable:` drops a built-in that misfires in your
environment without forking the catalog.

```yaml
# ~/.vaultysclaw-sensor/catalog.yaml — only your additions
aiApplications:
  - name: acme_devbot
    kind: harness
    processNames: ["devbot"]
    cmdlineSubstrings: ["@acme/devbot"]

providers:
  - name: openai                    # extends the built-in rather than replacing it
    hosts: ["api.eu.openai.com"]

disable:
  aiApplications: ["xcode"]
```

Two commands go with it:

```bash
vaultysclaw-sensor catalog dump    # the effective rule set, ready to edit
vaultysclaw-sensor catalog check   # validate, and show what your file changed
```

`check` reports what actually changed rather than only that the file parsed:

```
providers                38       39   added acme_internal_llm
aiApplications           31       32   added acme_devbot; disabled xcode
```

### It reloads without a restart

The catalog is re-read when it changes, checked once per poll cycle. A new coding
harness ships and is on developers' machines within days; the sensor watching for
it may be a long-lived daemon on a fleet of laptops nobody wants to restart.

An **invalid** catalog is refused and the running rule set kept, with the reason
logged. That asymmetry is deliberate: the one failure mode a detection sensor must
not have is silently detecting less. Nothing latches, so a file caught mid-write
costs one cycle; deleting the file reverts to the built-ins, which is a legitimate
way to back out a bad catalog.

Validation also rejects matcher fragments under three characters — a two-character
substring matches most of the process table, and that flood is far harder to
diagnose than a startup error naming the rule.

## What "AI usage" and "AI agent" mean here

The application catalog sorts installed software into three kinds, and the
distinction is the point of the design rather than a detail:

| `kind` | Example | Contributes |
|---|---|---|
| `harness` | Claude Code, Codex, Cursor, aider, goose | AI **and** agent confidence — it edits files and runs commands |
| `assistant` | Kimi, ChatGPT.app, Claude Desktop | AI only — a chat window is usage, not an agent |
| `ide` | VS Code, Zed, JetBrains | **Nothing on its own.** "VS Code is installed" is not AI usage; it scores only when the same process is also talking to a provider, which is what an inline completion looks like from outside |

A browser sits on the same line as an assistant: a tab open to a model's website
raises AI confidence and never agent confidence, however long it has been open.

An application is matched by process name, by **executable-path substring** — one
entry covers a whole app bundle's helper processes — or by command line, for a CLI
run through `node` or `python`. An app's crash reporters and auto-updaters live
inside the same bundle and are suppressed: reporting Codex's crashpad handler as
an agent is noise that buries the process actually talking to a model.

### Provider matching cannot rely on reverse DNS

Worth knowing because it explains a whole class of missed detection. On macOS and
Windows the OS reports a bare peer IP for every connection, and the major AI APIs
publish no PTR record — `api.anthropic.com` is an address that, asked for its
name, returns nothing. Reverse DNS alone therefore matches **no** provider on a
laptop running several AI tools.

So the sensor also resolves the provider catalog *forward* on a refresh interval
and inverts it into an address→provider index, rebuilt immediately when the
catalog reloads. An index hit is weighted **below** a hostname match on purpose:
CDN address space is shared, so it is good evidence of the provider, not proof.

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
- its configuration **is** editable from the console now — mode, freshness, and
  the rule list, on the Actor detail page — with the panel showing whether a
  change has actually reached the point or is waiting for a reconnect.

## Upgrading a sensor to a harness supervisor

The same binary's third role: **supervise**. Instead of watching the host or
refusing network traffic, it launches a coding harness and decides *every tool
call* locally, from a signed grant and a signed rule set, with no control-plane
round trip.

```bash
vaultysclaw-sensor supervise --config ~/.vaultysclaw-sensor/config.yaml -- claude
vaultysclaw-sensor report          # what supervised sessions did, and the scope they would need
vaultysclaw-sensor sandbox-check   # prove OS confinement is really in force
```

It registers as the [`harness` kind](/docs/architecture/agent-kinds#harness--supervised-coding-harness),
and like `intercept` it is **off unless asked for** — enabling a role is always a
deliberate act, never a consequence of upgrading.

Two things decide whether anything is really being enforced, and both are worth
reading before you rely on it:

- **`mode: observe` refuses nothing.** It decides and records every call. That is
  the default and should stay the default for a while on a new deployment: the
  resource strings this role produces end up inside signed certificates, so they
  are learned from real traffic before being frozen. `report` is how you learn
  them; `explicit` is what enforces them afterwards.
- **Without OS confinement, even `explicit` is advisory.** A subprocess or an
  edited harness config bypasses the hook. `sandbox: require` refuses to launch
  where confinement cannot be established, rather than continuing in advisory
  mode — that is the setting for an operator who actually depends on it.

And unlike a proxy in a rack, this one usually runs on **someone's laptop**. A
rule written here can stop a developer working, which is a governance property
rather than a footnote.
