package vconn

import (
	"testing"

	"github.com/vaultys/vaultysid/go/pkg/vaultysid"
)

// TestHandshake_FullRoundTrip_NoNetwork drives a client-role and
// server-role Handshake against each other via direct byte exchange (no
// sockets) — the core protocol correctness test.
func TestHandshake_FullRoundTrip_NoNetwork(t *testing.T) {
	clientID, err := vaultysid.GenerateMachine()
	if err != nil {
		t.Fatalf("GenerateMachine (client): %v", err)
	}
	serverID, err := vaultysid.GenerateMachine()
	if err != nil {
		t.Fatalf("GenerateMachine (server): %v", err)
	}

	client := NewHandshake(clientID)
	server := NewHandshake(serverID)

	// Client initiates.
	initB64, err := client.Start()
	if err != nil {
		t.Fatalf("client.Start: %v", err)
	}

	// Server processes INIT, produces STEP1.
	step1B64, err := server.Accept(initB64)
	if err != nil {
		t.Fatalf("server.Accept(init): %v", err)
	}
	if step1B64 == "" {
		t.Fatal("expected server to produce a STEP1 response")
	}
	if server.IsComplete() {
		t.Fatal("server should not be complete after producing STEP1")
	}

	// Client processes STEP1, produces COMPLETE.
	completeB64, err := client.Accept(step1B64)
	if err != nil {
		t.Fatalf("client.Accept(step1): %v", err)
	}
	if completeB64 == "" {
		t.Fatal("expected client to produce a COMPLETE response")
	}
	if !client.IsComplete() {
		t.Fatal("expected client to be complete after producing COMPLETE")
	}

	// Server processes COMPLETE, finalizes (nothing more to send).
	finalB64, err := server.Accept(completeB64)
	if err != nil {
		t.Fatalf("server.Accept(complete): %v", err)
	}
	if finalB64 != "" {
		t.Errorf("expected no further message after finalize, got %q", finalB64)
	}
	if !server.IsComplete() {
		t.Fatal("expected server to be complete after finalize")
	}

	// Both sides should agree on each other's DID.
	serverSeesClientDID, err := server.RemoteDID()
	if err != nil {
		t.Fatalf("server.RemoteDID: %v", err)
	}
	if serverSeesClientDID != clientID.DID() {
		t.Errorf("server resolved wrong client DID: got %s, want %s", serverSeesClientDID, clientID.DID())
	}

	clientSeesServerDID, err := client.RemoteDID()
	if err != nil {
		t.Fatalf("client.RemoteDID: %v", err)
	}
	if clientSeesServerDID != serverID.DID() {
		t.Errorf("client resolved wrong server DID: got %s, want %s", clientSeesServerDID, serverID.DID())
	}
}

func TestHandshake_RejectsSpoofedIdentity(t *testing.T) {
	clientID, _ := vaultysid.GenerateMachine()
	attackerID, _ := vaultysid.GenerateMachine()
	serverID, _ := vaultysid.GenerateMachine()

	client := NewHandshake(clientID)
	server := NewHandshake(serverID)
	attacker := NewHandshake(attackerID)

	initB64, err := client.Start()
	if err != nil {
		t.Fatalf("client.Start: %v", err)
	}
	step1B64, err := server.Accept(initB64)
	if err != nil {
		t.Fatalf("server.Accept(init): %v", err)
	}

	// The attacker (a different identity) tries to complete the handshake
	// in place of the real client, without holding the client's private
	// key — it can't produce a valid COMPLETE signed as the client, so
	// this should fail rather than let the attacker impersonate the DID
	// the server already started a handshake with.
	if _, err := attacker.Accept(step1B64); err == nil {
		t.Fatal("expected the attacker's handshake to fail — it never received this challenge as PK1")
	}
}
