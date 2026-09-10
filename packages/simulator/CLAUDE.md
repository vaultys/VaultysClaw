# packages/simulator

A fleet simulator: thousands of **real** Actors driven against a live control plane. Every member
is a `packages/sdk` `ActorRuntime` with its own VaultysId, so every connection is a genuine
Challenger handshake, every certificate is really issued and really verified, and every status
check is a signed round trip. A simulator that faked the protocol would only prove the simulator
works.

## The demo environment

The simulator runs against its **own** stack — a separate Postgres and control plane on separate
ports — never your dev database. A 7,000-Actor run must not be able to touch the database holding
your real Actors, and a demo reset should be as blunt as deleting a volume.

```bash
pnpm simulator:up        # database + migrations + build + control plane (3003 / ws 8083)
pnpm simulator:demo      # 2,000 estate + 5,000 agent Actors against it
pnpm simulator:down      # stop, keep the data
pnpm simulator:nuke      # stop and delete the volume
```

`docker/simulator.env` is the single source of truth for that environment's coordinates — the
compose file reads it and every `pnpm simulator:*` script sources it, so the ports cannot drift
apart. Committed on purpose: nothing in it is secret.

Three things about that environment are deliberate:

- **Production mode, not dev.** Next 16 refuses to start a second *dev* server for the same project
  directory (a lockfile, not a port clash), so a demo control plane could never run beside your
  `pnpm controlplane:dev`. Production mode takes no such lock, and its Next compilation doesn't
  compete for CPU with the thing being measured. Hence the build step in `simulator:up`.
- **No Redis, no Apprise.** With `REDIS_URL` unset the webhook producers are no-ops. A 7,000-Actor
  ramp would otherwise enqueue tens of thousands of jobs nothing consumes. The audit log still
  records everything — that write is inline, not queue-backed.
- **Postgres runs with `fsync=off`.** Correct *here* precisely because losing the whole volume
  costs nothing. Never do this to a database you care about.

## Getting into the console: `pnpm simulator admin`

The demo stack starts with an empty database, so there is nobody who can open the console to look
at the fleet the simulator just built. `simulator admin` mints one:

```bash
pnpm simulator admin --passphrase "at least eight chars" --name "Demo Admin"
```

It generates a VaultysID server-side, writes the human Actor and a standing
`admin_console_access` + `portal_access` grant into the ledger, and exports the key two ways:

- **a one-line browser-console snippet** (printed, and saved beside the backup) that loads the key
  straight into `localStorage`, and
- **the passphrase-encrypted backup file** `lib/identity-backup.ts` restores — the same format the
  console's own "Back up identities" writes.

The snippet exists because the proper restore UI **cannot be reached from the browser it is for**:
backup/restore lives behind the "advanced identity management" opt-in, whose toggle is on
`/identity` — a page you must already be signed in to open. From a fresh browser with no key that
is a closed loop. The snippet sets the opt-in too, so the picker and backup panel are there
afterwards.

Nothing about the resulting Actor is special: it is an ordinary human holding an ordinary
certificate, and the browser signs in with the same Challenger exchange as always. What *is*
special is that this bypasses admin approval entirely — **only ever point it at a disposable
database.**

Two things it deliberately refuses to paper over: a `--email` already held by another human (every
run mints a *new* identity, so re-running with the same address collides on `User.email`, and a raw
P2002 from a nested create says nothing useful), and a control plane that has never started (no
`serverSecret` yet, so there is no key to sign a grant with).

`simulator reset` does not touch it — reset is scoped to the simulator's own name prefixes, so the
admin survives resetting the fleet, which is the whole point of having one.

## Commands

```bash
pnpm simulator run [options]     # bring a fleet up and keep it active
pnpm simulator approve           # approve every pending registration (bulk, via the database)
pnpm simulator stats             # what the control plane currently holds
pnpm simulator reset             # delete simulated Actors and their identities
pnpm simulator admin             # mint an admin human + export its VaultysID (see above)
pnpm simulator --help
```

Useful flags: `--actors` / `--agents` (fleet size), `--rate` (ramp), `--reconnect-rate`,
`--duration`, `--auto-approve`, `--status-refresh <ms>`, `--url`, `--data-dir`.

## How it works

**Identities persist** (`--data-dir`, default `.simdata`, one directory per member). This is what
makes a rerun mean something: fresh keypairs every run would flood the control plane with new
registrations and make the second run indistinguishable from the first, so approvals could never be
demonstrated. With stable DIDs, run → approve → run again shows the same fleet coming back
certified.

**Personas, not uniform load** (`personas.ts`). A sensor is chatty and stateless; a device is
mostly idle on a flaky link; a proxy re-checks aggressively and never churns because it is
infrastructure. A control plane whose load is 90% sensor telemetry behaves very differently from
one whose load is agent capability checks, so modelling the mix is the difference between
load-testing the WebSocket accept path and exercising the system. Churn is modelled deliberately:
a fleet where nothing ever disconnects never exercises the reconnect path, which is where grant
re-delivery and status re-verification live.

**`db.ts` is the only file that touches the database**, and it is not reachable from `fleet.ts`.
Approval is an admin act that exists precisely so an Actor cannot grant itself anything — the
simulator stands in for the admin, not for a client. A simulator that could approve itself over the
wire would be evidence of a hole, not a convenience. Approvals are also **name-scoped**, so a
developer's real agent sitting in the same queue is never granted capabilities because a load test
ran.

Bulk approval must **create the `Actor` row**, not just flip the registration status — that is what
`approvePendingRegistration` does, and missing it produced a fleet that reconnected forever with a
growing pending queue and zero errors.

## A run checks the control plane is there first

`run` probes the WebSocket target before spawning anything. The control plane lives in its own
terminal (`simulator:up` stays in the foreground), so the ordinary mistake is starting a fleet
without it — and every Actor then fails independently, turning one missing process into thousands
of identical `ECONNREFUSED` lines that read like the simulator is broken. One probe up front turns
that into one sentence naming the command to run.

## Sensors get a place on the map

`locations.ts` gives every simulated **sensor** a location, so `/admin/map` has something to draw.
Only sensors: a sensor is a machine sitting somewhere physical, whereas an `openclaw` agent is a
process, and pinning one to a city would be inventing a fact.

The cities model Bpifrance's regional network — the Maisons-Alfort head office, the regional
offices across metropolitan France, and the overseas ones. **City-centre coordinates, not office
addresses**, and not maintained against anyone's actual site directory; the shape is what matters.
A fleet dense around Paris, spread thinly across the regions, with a handful of points 7,000 km
away in the Antilles, Guyane, La Réunion and Mayotte is what makes the map exercise clustering and
extent-fitting properly. A ring of pins around one city would not.

Two details that are load-bearing:

- **Assignment is by hash of the DID**, not round-robin, so a given sensor lands in the same city
  on every run even when the fleet size or approval order changes. A demo map that rearranges
  itself between runs is much harder to talk over.
- **Each point is jittered a few kilometres** around its city centre. Identical coordinates stack
  into a single pin that no amount of zooming separates — the map would show "12" forever.

Locations are applied on **update** as well as create, so re-running fills in a fleet that was
approved before this existed, rather than needing a reset.

## Ramp and reconnect rates are separate, and both matter

`--rate` bounds what the simulator *starts*; `--reconnect-rate` (default: half of `--rate`) bounds
what the control plane can *finish*, because a reconnect wave lands on a server still working
through the tail of the original ramp. Cycling the whole fleet after a bulk approval produced 11,846
`ETIMEDOUT`s; cycling only the members that actually need a grant, at half the rate, cut that to
2,413. `reconnectPending` does the latter.

The ramp itself exists because a stampede measures the wrong thing: thousands of simultaneous
WebSocket upgrades exhaust the accept backlog long before the control plane's real handshake
capacity is reached, and the resulting failures look like server bugs.

## Reading the report

Lifecycle counts (connecting / pending / connected / certified) are **derived** by counting
members, never incremented. They used to be counters, and every transition had to increment one
field and decrement another; miss one edge and the totals drift silently. Cumulative counters
(spawned, reconnects, status checks, telemetry, errors) stay counters.

Errors are **grouped** with the variable parts collapsed — 7,000 copies of one error is one bug,
and a per-actor log at fleet scale is both unreadable and its own bottleneck.

A member that **restored** a certificate from disk counts as certified even though no
`certificate` event fires (nothing was issued — the grant was collected on an earlier run). Missing
that undercounted every rerun by thousands.

## What it has found

Real bugs, in the control plane and in this package:

- **Phantom registrations**: `handleCapabilityRequest` only looked for a *pending* registration, so
  an Actor reconnecting to collect a grant an admin had just approved filed a redundant one — every
  simulated Actor ended a run with both an approved and a pending registration, doubling the
  approval queue.
- **The whole Scale section** of `packages/controlplane/CLAUDE.md`: the server identity being
  re-derived per handshake, the default 10-connection pool, and write amplification on the heartbeat
  and status-check paths. Handshake p50 went 3047 ms → 840 ms at 700 concurrent Actors.
- Its own bugs: handshake latency reported as 0 ms (only recorded on `connected`, but a first run is
  all `pending_approval`), and `\r` progress output turning a piped log into one unreadable line.

## Tests

`__tests__/` covers the pure logic — the fleet-composition mix and the report rendering. Run:
`pnpm --filter @vaultysclaw/simulator test`.
