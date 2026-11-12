module github.com/vaultys/vaultysclaw-hooks

go 1.25.5

// The decision core (sdk-go/toolgate), certificate verification (grant) and
// signed rule sets (rules) come from the sibling SDK module, exactly as they do
// for vaultysclaw-sensor. The replace keeps a checkout of this repo building.
replace github.com/vaultys/VaultysClaw/sdk-go => ../sdk-go

require (
	github.com/vaultys/VaultysClaw/sdk-go v0.0.0-00010101000000-000000000000
	github.com/vmihailenco/msgpack/v5 v5.4.1
)

require (
	github.com/fxamacker/cbor/v2 v2.9.0 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/vaultys/vaultysid/go v0.0.0-20260729122600-9046639cc232 // indirect
	github.com/vmihailenco/tagparser/v2 v2.0.0 // indirect
	github.com/x448/float16 v0.8.4 // indirect
	golang.org/x/crypto v0.21.0 // indirect
	golang.org/x/sys v0.18.0 // indirect
)
