# packages/simulator

Drives a fleet of **real** Actors at a live control plane. Every member is a `packages/sdk`
`ActorRuntime` with its own VaultysId, so every connection is a genuine Challenger handshake, every
certificate is really issued and verified, and every status check is a signed round trip. A
simulator that faked the protocol would only prove the simulator works.

```bash
pnpm simulator run --actors 2000 --agents 5000 --auto-approve   # bring a fleet up
pnpm simulator approve                                          # bulk-approve pending registrations
pnpm simulator stats                                            # what the control plane holds
pnpm simulator reset                                            # remove simulated actors + identities
pnpm simulator run --help
```

The root `simulator` script sources `packages/controlplane/.env`, so the simulator and the control
plane always agree on `DATABASE_URL` — the same reason `controlplane:webhook:dev` does.

## Shape

- **`personas.ts`** — what each kind *does*. A sensor is chatty and stateless, a device is idle on a
  flaky link, a proxy re-checks aggressively and never churns. Modelling this is the difference
  between load-testing the WebSocket accept path and exercising the system.
- **`fleet.ts`** — spawns and drives members, rate-limited. Owns member state; the metrics *derive*
  counts from it rather than tracking increments (an earlier version incremented on every
  transition and silently drifted whenever an edge was missed).
- **`db.ts`** — the **only** file that touches the database, and unreachable from `fleet.ts`. See
  "Why approval goes through SQL" below.
- **`metrics.ts`** — cumulative counters, grouped errors, handshake percentiles.

## Why approval goes through SQL

Approval is an admin act that exists precisely so an Actor cannot grant itself anything. The
simulator stands in for the *admin*, not for a client — so it approves by writing to the database,
and there is deliberately no wire path for a client to approve itself. If one existed, the
simulator wouldn't need this file, and that would be a hole rather than a convenience.

Approval must **create the `Actor` row**, not just flip `PendingRegistration.status`. Skipping that
leaves `ActorDAO.findByDid` returning null, so the Actor's next connection is treated as a
brand-new registration, files a second request, and is never certified — a fleet that reconnects
forever with a growing pending queue and *zero errors*. Certificates are still minted over a live
`service: "certificate"` exchange on the next connection, never forged here.

## Identities persist

One directory per member under `--data-dir` (default `.simdata`), reused across runs. This is what
makes a rerun mean something: fresh keypairs every run would flood the control plane with new
registrations and make run 2 indistinguishable from run 1, so approval could never be demonstrated.
With stable DIDs, `run` → `approve` → `run` shows the same fleet coming back certified.

## Ramping is not optional

A stampede measures the wrong thing: thousands of simultaneous WebSocket upgrades exhaust the accept
backlog long before the control plane's actual handshake capacity is reached, and the resulting
failures look like server bugs. `--rate` and `--max-in-flight` find the sustainable rate instead of
the connect-storm cliff. Every per-member timer is jittered ±25% for the same reason.

## What it found

Real bugs, on the runs that produced this file:

- **Phantom pending registrations.** `handleCapabilityRequest` only checked for a *pending*
  registration, so an Actor reconnecting to collect a grant an admin had just approved filed a
  redundant one — one phantom queue entry per approved Actor. Fixed in `lib/ws-server.ts`.
- **Handshake latency degrades sharply with concurrency.** ~300 ms at 15 actors, ~3 s at 700,
  p99 24 s at 7,000 with a 200/s ramp. The handshake path, not the socket count, is the limit.
- Its own reporting bugs: handshake percentiles read 0 because latency was only recorded on
  `connected` and a first run is *all* `pending_approval`; and 18,449 socket errors rendered as
  blank lines because `err.message` was empty (hence `Metrics.describe`).

## Scale

Identity generation is ~1.5 ms, so keys are never the constraint. In order, the real limits are the
control plane's handshake throughput, Postgres write throughput, and only then file descriptors
(`ulimit -n`). Millions of Actors is not this tool: it is one process against one control plane.
