# Integrating vaultysclaw-sensor into VaultysClaw (design note, not implemented)

`vaultysclaw-sensor` and its standalone reference collector (`cmd/collector`)
are deliberately independent of the main VaultysClaw monorepo — no code in
`packages/control-plane` was touched to build this. This note documents
where the seams are so a future pass can wire real ingestion into the
control plane with minimal redesign. Nothing here is implemented; it's a
target, written down so the eventual work is a known-shape task rather than
a fresh investigation.

**Update (phase 2):** the identity/connection gap described in the original
version of this note is now closed. The sensor and collector use a real
`VaultysID` (`github.com/vaultys/vaultysid/go`) and a real register →
challenge → admin-approval → connected handshake (`internal/vconn`) —
cryptographically and protocol-wise the same mechanism
`packages/control-plane/lib/auth-handler.ts` drives for every actual agent
connection today (same `Challenger` state machine, same msgpack wire
format, same `SHA256("VAULTYS_SIGN"||data)` + Ed25519 signing scheme, same
protocol version). What remains below is narrower than before: mostly
*which* server the sensor talks to, not *how* it proves its identity.

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

## 1. Data model mapping

The reference collector's in-memory shapes (`internal/ingest/store.go`)
map directly onto two new workspace-scoped Prisma models, following the
existing `Agent`/`Proxy` conventions in
`packages/control-plane/prisma/schema.prisma`. Note `Device.ID` is now a
real `did:vaultys:...` — there's no separate public-key-pinning field to
carry over, since the handshake proves key possession cryptographically on
every connection:

| Reference collector (`ingest.Device` / `ingest.Workload`) | Future Prisma model |
|---|---|
| `Device{ID (a real DID), Hostname, OS, FirstSeen, LastSeen}` | `SensorDevice{id (=did), workspaceId, hostname, os, firstSeen, lastSeen}` |
| `Workload{Fingerprint, DeviceID, ProcessName, Executable, Command, User, Provider, Model, AIConfidence, AgentConfidence, Reasons, IsMCP, MCPServers, IsLocalRuntime, Status, LastEventType, FirstSeen, LastSeen}` | `SensorWorkload{id, deviceId (FK), fingerprint (unique per device), ...same fields..., status computed, not stored}` |

`Status` should be **computed at query time**, not persisted — the
reference collector can only ever produce `observed`/`shadow` because it
has no visibility into VaultysClaw's `Agent` registry (see §4). A real
integration adds `managed` by joining against `Agent` server-side.

## 2. Connection target: reuse the real control plane's WS server as-is

Today: the sensor drives its handshake (`internal/vconn/client.go`)
against the **standalone collector's own** WS server
(`internal/vconn/server.go`) — a self-contained implementation of the same
protocol, built so the sensor didn't require any `packages/control-plane`
changes to get real connection behavior.

Target: point the sensor at `packages/control-plane`'s actual WebSocket
server (port 8080) instead. Because the handshake is already real
VaultysId/`Challenger` (protocol version 1, matching `vid.toVersion(1)` in
`lib/auth-handler.ts`), **no changes are needed to the register/challenge/
approval flow itself** — `handleRegisterRequest`/`handleAuthChallenge` in
`lib/ws-server.ts` already do exactly what `internal/vconn/server.go`
does, just against real `Agent`/`PendingRegistration` tables instead of
the collector's in-memory maps. The sensor would show up in the real
Registrations/Agents UI exactly like agent-controller or mcp-gateway do.

`internal/vconn`'s message naming (`auth_challenge`/`auth_complete`/
`auth_failed`) was chosen to mirror `packages/control-plane`'s WS protocol
for exactly this reason — the concepts (and much of the state-machine
shape) transfer directly; only the message registration handshake's outer
framing (`register` vs. going straight to `auth_challenge`) would need a
small adjustment to match `ws-server.ts` exactly. `HandshakeProtocol`/
`HandshakeService` (currently `"vaultysclaw"`/`"sensor"`, only required to
match between our own client and collector) would need to be set to
whatever `packages/sdk`'s agent runtime actually passes to `Challenger.Init`
(not verified here — `packages/sdk` has no source on this branch to check
against; confirm against a branch where it's present).

## 3. What's still missing: a telemetry-receiving message

The real control plane's WS protocol has no equivalent of
`sensor_telemetry` today — agents send `result`/`heartbeat`/activity-log
style messages, not device/workload observations. The one non-trivial
addition needed is a new WS message handler in `lib/ws-server.ts` (mirroring
the existing `handleProxyActivityLog` pattern: batch-insert into a new
`SensorWorkload` table via a DAO, keyed by the connected agent's DID) plus
the Prisma model from §1. Everything upstream of that handler — the
handshake, the message envelope, the telemetry batch shape — is unchanged
from what `internal/vconn` already sends.

## 4. managed / observed / shadow

The reference collector's `computeStatus()` (`internal/ingest/store.go`)
only ever returns `observed` or `shadow` (agent confidence ≥ 0.75). A real
integration adds `managed`, server-side, by correlating a workload's
evidence against VaultysClaw's `Agent` table for the same workspace — e.g.
matching a locally-observed VaultysClaw identity file/DID (reported via
`Workload.IdentityEvidence` in the wire schema, currently unused by the
reference collector) against a registered `Agent.did`. This is exactly the
design spec's intent: **the sensor reports observations and identity
evidence; the control plane decides organizational ownership** — the
sensor should never be trusted to self-report "I am managed."

Note this is *almost* automatic once §2/§3 land: if the sensor connects
using the same DID a real `agent-controller` process would use on that
machine, `AgentDAO.findByDid` already recognizes it as a known Agent — the
"managed" signal falls out of the existing auto-approve path rather than
needing new correlation logic, *if* the deployment story is "one VaultysId
per machine, shared between the sensor and any real agent on it." If
sensor identities are meant to be distinct from agent identities even on
the same machine (arguably cleaner), then the `IdentityEvidence` field is
the right mechanism instead.

## 5. Migration path, concretely

1. Add `SensorWorkload` to `schema.prisma` (no separate `SensorDevice` table
   needed if reusing `Agent` per the note in §4 — decide based on whether
   sensor and agent identities are meant to be shared or distinct).
2. Add `db/sensor-workload.dao.ts` (upsert-by-fingerprint, paginated `list()`),
   following `ProxyActivityLogDAO`'s batch-insert precedent but upsert
   instead of append (current-state semantics, not a log).
3. Add a `sensor_telemetry` WS message handler in `lib/ws-server.ts`
   alongside the existing handlers — no auth changes needed, the connection
   is already authenticated by the time any message but `auth_challenge`
   arrives.
4. Add the `managed` correlation from §4.
5. Point `vaultysclaw-sensor`'s config at the control plane's `ws://` URL
   instead of the reference collector's — `internal/vconn/client.go`
   doesn't change; `HandshakeProtocol`/`HandshakeService` may need
   adjusting per §2.
6. (Optional) a read-only dashboard page under `app/admin/sensors`, listing
   devices/workloads — same shape as the reference collector's `GET /`
   view, properly componentized.

None of this requires touching `internal/collector`, `internal/correlation`,
`internal/detector`, or `internal/state` in the Go module — the whole point
of the versioned wire schema and the real handshake is that the producer
and consumer can evolve independently.
