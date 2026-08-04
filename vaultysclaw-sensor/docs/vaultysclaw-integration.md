# Integrating vaultysclaw-sensor into VaultysClaw

`vaultysclaw-sensor` and its standalone reference collector (`cmd/collector`)
were built deliberately independent of the main VaultysClaw monorepo. This
note documents the seams; most of it is now **implemented and verified**
against the real control plane, not just designed.

**Update (phase 2):** the identity/connection gap described in the original
version of this note is closed. The sensor and collector use a real
`VaultysID` (`github.com/vaultys/vaultysid/go`) and a real register →
challenge → admin-approval → connected handshake (`internal/vconn`).

**Update (phase 3 — real wiring, done):** the sensor now connects directly
to `packages/controlplane`'s actual WebSocket server — not the old
`packages/control-plane` this note originally targeted, which has since
been superseded by the rebuild — and the connection lifecycle, capability-
free approval, and telemetry ingestion are all real and verified end to
end against a live control plane on a real machine (Ollama + this very
Claude Code process detected and persisted). Two real protocol bugs were
found and fixed in the process (§2), not just configuration:

1. `internal/vconn/client.go` unconditionally read an unsolicited "hello"
   before sending `register`. `packages/controlplane/lib/ws-server.ts`
   sends nothing at all until it receives `register` — a client waiting
   for a first message it'll never get hangs forever. Fixed by sending
   `register` first and deriving the session id from its ack instead.
2. `internal/vconn/server.go` (the reference collector) sent that same
   proactive hello *and* a post-register ack carrying the same session id
   — two near-identical messages that raced with the corrected client:
   whichever the client's `ReadJSON` picked up first was fine on its own
   (same session id either way), but the other was left unread and
   corrupted the very next handshake round. Fixed by removing the
   proactive hello so there's exactly one message per round, matching the
   real server.

What's still exactly what §3–§4 below describe as missing: `managed`
device correlation against a real `Agent`/`Actor` registry, and the
optional `/admin/sensors` dashboard (§5 step 6).

## What stays exactly the same

The sensor binary (`cmd/sensor`) and everything upstream of telemetry —
collection, correlation, detection, state/dedup — needs **zero changes**.
It already speaks a versioned, self-contained wire schema
(`internal/telemetry/event.go`, `schemaVersion: 1`), now carried inside a
`sensor_telemetry` WebSocket message rather than a REST POST. Device
identity (`internal/identity`) and the handshake driver
(`internal/vconn/handshake.go`) are **already** the real thing — they don't
change if this is ever pointed at the real control plane instead of the
reference collector.

## 1. Data model mapping — done

No separate `SensorDevice` table: a connected sensor already **is** an
`Actor` (`kind: "sensor"`, its own real `did:vaultys:...`) in
`packages/controlplane/prisma/schema.prisma` — there's no separate public-
key-pinning field to carry over either, since the handshake proves key
possession cryptographically on every connection. Only the workload side
needed a new model:

| Reference collector (`ingest.Device` / `ingest.Workload`) | Actual Prisma model |
|---|---|
| `Device{ID (a real DID), Hostname, OS, FirstSeen, LastSeen}` | `Actor{did, kind: "sensor", name, registeredAt, lastSeen}` (existing model, reused as-is) |
| `Workload{Fingerprint, DeviceID, ProcessName, Executable, Command, User, Provider, Model, AIConfidence, AgentConfidence, Reasons, IsMCP, MCPServers, IsLocalRuntime, Status, LastEventType, FirstSeen, LastSeen}` | `SensorWorkload{id, deviceDid (FK to Actor), fingerprint (unique per device), ...same fields..., status still not computed — see §4}` |

`Status` (`managed`/`observed`/`shadow`) is **not yet computed anywhere** —
`SensorWorkload` just stores what the sensor reports; see §4, still open.

## 2. Connection target — done, with two real protocol fixes

The sensor now connects directly to `packages/controlplane`'s actual
WebSocket server (`lib/ws-server.ts`, default port 8081) — the standalone
collector (`internal/vconn/server.go`) is a test fixture now, not the
integration target. `HandshakeProtocol`/`HandshakeService` are `"p2p"`/
`"auth"`, matching `packages/controlplane`'s `verifyProtocol` check
(`protocol === "p2p" && (service === "register" || service === "auth")`)
— no `packages/sdk` involved; this rebuild's own agent runtime uses the
same values.

Verified end to end against a live control plane on a real machine: a
freshly built sensor binary registers, completes the real handshake, lands
in `registration_pending`, and — once an admin approves it with **no**
capabilities (sensors have none to grant; approving with an empty set
still promotes it to a connected `Actor`, just skips the interactive
certificate exchange entirely, see `deliverApprovedCapabilities` in
`lib/ws-server.ts`) — reconnects and reaches `auth_complete`, all logged
by the real sensor binary (`vconn: connected`).

Two real bugs surfaced doing this (not just config — see the top of this
file for the fix descriptions): `internal/vconn/client.go` was reading an
unsolicited "hello" that the real server never sends, and
`internal/vconn/server.go` was sending a redundant one that raced with the
fix. Both fixed; `internal/vconn`'s tests (including a new
`TestClient_RealControlPlaneProtocol`, now corrected to match the real
server's actual sequence) pass.

## 3. Telemetry — done

`packages/controlplane/lib/protocol.ts` has a `sensor_telemetry` message
type (`SensorTelemetryPayload`, field-for-field matching
`internal/telemetry.Event`/`Workload`/`Device`/`ProcessInfo`'s JSON tags).
`lib/ws-server.ts`'s `handleSensorTelemetry` upserts each event into
`SensorWorkload` by `(deviceDid, fingerprint)` — current-state, not an
append-only log, matching the sensor's own "report deltas" model.
`deviceDid` comes from the connection's own authenticated identity
(`connectedBySender`), never a client-claimed field, even though the
sensor also sets one on the envelope (`Envelope.AgentID`) — the server
doesn't need to trust it. Verified with real telemetry from this machine
(Ollama, a local MCP-pattern process) landing in Postgres.

## 4. managed / observed / shadow

The reference collector's `computeStatus()` (`internal/ingest/store.go`)
only ever returns `observed` or `shadow` (agent confidence ≥ 0.75). A real
integration adds `managed`, server-side, by correlating a workload's
evidence against VaultysClaw's `Actor` table for the same workspace — e.g.
matching a locally-observed VaultysClaw identity file/DID (reported via
`Workload.IdentityEvidence` in the wire schema, currently unused by the
reference collector) against a registered `Actor.did`. This is exactly the
design spec's intent: **the sensor reports observations and identity
evidence; the control plane decides organizational ownership** — the
sensor should never be trusted to self-report "I am managed."

Note this is *almost* automatic given §2/§3 are done: if the sensor
connects using the same DID a real `agent-controller` process would use on
that machine, `ActorDAO.findByDid` already recognizes it as a known Actor
— the "managed" signal falls out of the existing auto-approve path rather
than needing new correlation logic, *if* the deployment story is "one
VaultysId per machine, shared between the sensor and any real agent on
it." If sensor identities are meant to be distinct from agent identities
even on the same machine (arguably cleaner), then the `IdentityEvidence`
field is the right mechanism instead. **Still not implemented** — this is
the one open item from the original design that real wiring didn't need
to touch.

## 5. Migration path, concretely

1. ~~Add `SensorWorkload` to `schema.prisma`~~ — done; no separate device
   table needed, the sensor's connection already makes it an `Actor`.
2. ~~Add `db/sensor-workload.dao.ts`~~ — done (`upsert`/`listForDevice`/`list`).
3. ~~Add a `sensor_telemetry` WS message handler in `lib/ws-server.ts`~~ —
   done (`handleSensorTelemetry`).
4. Add the `managed` correlation from §4. **Not done.**
5. ~~Point `vaultysclaw-sensor`'s config at the control plane's `ws://` URL~~
   — done (`VCS_COLLECTOR_URL=http://localhost:8081` in dev; `internal/
   vconn/client.go` needed the register/hello fix from the top of this
   file, not a config-only change as originally expected).
6. (Optional) a read-only dashboard page under `app/admin/sensors`, listing
   devices/workloads — same shape as the reference collector's `GET /`
   view, properly componentized. **Not done** — `SensorWorkload` rows are
   real and queryable, just not surfaced in the admin UI yet.

None of this required touching `internal/collector`, `internal/correlation`,
`internal/detector`, or `internal/state` in the Go module — the whole point
of the versioned wire schema and the real handshake is that the producer
and consumer can evolve independently.
