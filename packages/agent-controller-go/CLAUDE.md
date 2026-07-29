# packages/agent-controller-go

A minimal, dependency-light agent-controller written in Go — the same
control-plane WebSocket protocol as `packages/agent-controller`/`packages/sdk`,
but compiled to a single static binary (a few MB) instead of requiring a
Node.js runtime. Built for machines where installing Node everywhere isn't
practical (edge devices, lightweight VMs, containers).

**Scope**: transport + identity + auth handshake + intent dispatch only. No
LLM, tools, skills, or memory — those stay in `packages/agent-controller`.
Replace `handleIntent` in `cmd/agent-controller/main.go` with real dispatch
logic for your use case.

## Why this is not a straight `go get`

`vaultysid` (the Go port of `@vaultys/id`, upstream repo `vaultys/vaultysid`,
branch `go_implementation`) isn't tagged/published yet — it's vendored as a
**git submodule** at `third_party-vaultysid/`, pinned via a `replace` directive
in `go.mod`. Clone with `git submodule update --init` (or `git clone
--recurse-submodules`) before building.

## Layout

- **`cmd/agent-controller/main.go`** — entry point; loads env config, loads/
  generates the VaultysID, wires `handleIntent`.
- **`internal/identity/`** — loads/generates a machine `VaultysID`, persisted
  as `base64(type-byte || secret)` at `VAULTYS_ID_PATH` — same on-disk format
  as `packages/sdk/src/base-agent.ts`'s `initVaultysId`, so identity files are
  interchangeable between the Go and Node runtimes.
- **`internal/agent/`** — `Runtime`: WebSocket connection + reconnect backoff,
  the VaultysID `Challenger` auth handshake (`register` → `auth_challenge` ↔
  → `auth_complete`), heartbeat loop, and intent dispatch. Mirrors
  `packages/sdk/src/base-agent.ts` message-for-message — same JSON envelope
  (`packages/shared/src/types.ts`'s `WSMessage`), not msgpack.
- **`internal/protocol/`** — the `WSMessage` envelope + payload structs.
- **`internal/cert/`** — verifies the control plane's signed-intent cert
  format (`packages/policy/src/certs/codec.ts`):
  `base64(4-byte-LE bodyLen | msgpack(body) | signature)`.

## Environment

| Variable | Purpose |
|---|---|
| `AGENT_NAME` | Agent display name (default `go-agent`) |
| `CONTROL_PLANE_WS_URL` | WebSocket URL (default `ws://localhost:8080`) |
| `VAULTYS_ID_PATH` | Path to the identity secret file (default `./vaultys-id.secret`) |

## Build / run

```bash
go build -o agent-controller ./cmd/agent-controller
CONTROL_PLANE_WS_URL=ws://localhost:8080 AGENT_NAME=my-go-agent ./agent-controller
```

Binary size is ~7 MB static (no Node runtime, no shared libs beyond libc).

## Verified against the real control plane

The Challenger auth handshake (register → challenge/response → auth_complete)
was verified end-to-end against a running `packages/control-plane` instance —
the server logged `"Auth completed successfully"` with the DID recovered
correctly from the agent's certificate. New agents land in
`registration_pending` same as any Node agent; an admin must approve them from
the dashboard before they receive `auth_complete`'s full capability set.

## Upstream bugs found and patched in the vendored submodule

Two protocol bugs were found in `vaultys/vaultysid`'s `go_implementation`
branch while getting this to interoperate with the real (TypeScript)
control plane. Both are patched locally in `third_party-vaultysid/` (a git
submodule — the patch lives only in this repo's copy until upstream fixes
it) and **should be reported upstream**:

1. **`Challenger.SerializeUnsigned` didn't special-case protocol version 0.**
   TS's `Challenger.ts` uses a hand-rolled msgpack encoder (`encode_v0`) for
   version-0 challenges (the default for every agent) that (a) omits the
   `version` field from the signed bytes and (b) always emits bin16/bin32
   headers for byte fields. The Go port always used the generic/v1 encoding
   path, which produced different signed bytes than TS for every v0 identity
   — breaking cross-language signature verification for the default protocol
   version. Fixed by adding an `encodeV0` path mirroring TS's encoder exactly
   (`pkg/challenger/challenger.go`).
2. **`Challenger.Finalize` only accepted the responder role.** It required
   `completeChallenge.PK2 == self`, but the *initiator* (pk1) also receives
   and must accept the final COMPLETE message to close out the handshake —
   TS's equivalent (`setChallenge`) accepts either `pk1` or `pk2` matching
   self. Fixed to accept either role.

Both fixes are isolated to `third_party-vaultysid/go/pkg/challenger/challenger.go`.
