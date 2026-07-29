module github.com/vaultys/vaultysclaw/agent-controller-go

go 1.21.13

require (
	github.com/gorilla/websocket v1.5.3
	github.com/vaultys/vaultysid/go v0.0.0-00010101000000-000000000000
	github.com/vmihailenco/msgpack/v5 v5.4.1
)

require (
	github.com/fxamacker/cbor/v2 v2.9.0 // indirect
	github.com/vmihailenco/tagparser/v2 v2.0.0 // indirect
	github.com/x448/float16 v0.8.4 // indirect
	golang.org/x/crypto v0.21.0 // indirect
	golang.org/x/sys v0.18.0 // indirect
)

replace github.com/vaultys/vaultysid/go => ./third_party-vaultysid/go
