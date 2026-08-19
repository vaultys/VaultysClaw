// The VaultysClaw Go SDK — everything a third party needs to build an Actor
// that connects to the rebuilt control plane (packages/controlplane): the
// VaultysId-authenticated connection lifecycle, offline certificate
// verification, and the permission-resolution engine.
//
// Extracted from vaultysclaw-sensor/internal/*, which made this code
// importable only within that module. The sensor now consumes this module
// rather than owning it, so the reference implementation and the SDK can never
// drift apart.
module github.com/vaultys/VaultysClaw/sdk-go

go 1.25.5

require (
	github.com/gorilla/websocket v1.5.3
	github.com/vaultys/vaultysid/go v0.0.0-20260729122600-9046639cc232
	github.com/vmihailenco/msgpack/v5 v5.4.1
)

require (
	github.com/fxamacker/cbor/v2 v2.9.0 // indirect
	github.com/vmihailenco/tagparser/v2 v2.0.0 // indirect
	github.com/x448/float16 v0.8.4 // indirect
	golang.org/x/crypto v0.21.0 // indirect
	golang.org/x/sys v0.18.0 // indirect
)
