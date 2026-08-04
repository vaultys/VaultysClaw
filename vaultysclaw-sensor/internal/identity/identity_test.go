package identity

import (
	"path/filepath"
	"testing"
)

func TestLoadOrCreate_GeneratesAndPersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "identity.secret")

	p1, err := LoadOrCreate(path)
	if err != nil {
		t.Fatalf("LoadOrCreate: %v", err)
	}
	if p1.DID() == "" {
		t.Error("expected a non-empty DID")
	}
	if !p1.VaultysID().IsMachine() {
		t.Error("expected a machine identity")
	}

	p2, err := LoadOrCreate(path)
	if err != nil {
		t.Fatalf("LoadOrCreate (reload): %v", err)
	}
	if p1.DID() != p2.DID() {
		t.Errorf("expected the same DID after reload, got %s vs %s", p1.DID(), p2.DID())
	}
}

func TestDID_LooksLikeVaultysDID(t *testing.T) {
	p, err := LoadOrCreate(filepath.Join(t.TempDir(), "identity.secret"))
	if err != nil {
		t.Fatalf("LoadOrCreate: %v", err)
	}
	const prefix = "did:vaultys:"
	if len(p.DID()) <= len(prefix) || p.DID()[:len(prefix)] != prefix {
		t.Errorf("expected DID to start with %q, got %q", prefix, p.DID())
	}
}

func TestSignAndVerify_RoundTrip(t *testing.T) {
	p, err := LoadOrCreate(filepath.Join(t.TempDir(), "identity.secret"))
	if err != nil {
		t.Fatalf("LoadOrCreate: %v", err)
	}

	data := []byte("some challenge bytes")
	sig, err := p.Sign(data)
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if !p.Verify(data, sig) {
		t.Error("expected signature to verify")
	}
}

func TestVerify_RejectsTamperedData(t *testing.T) {
	p, err := LoadOrCreate(filepath.Join(t.TempDir(), "identity.secret"))
	if err != nil {
		t.Fatalf("LoadOrCreate: %v", err)
	}
	sig, _ := p.Sign([]byte("original"))
	if p.Verify([]byte("tampered"), sig) {
		t.Error("expected verification to fail for tampered data")
	}
}

func TestVerify_RejectsWrongIdentity(t *testing.T) {
	p1, _ := LoadOrCreate(filepath.Join(t.TempDir(), "identity.secret"))
	p2, _ := LoadOrCreate(filepath.Join(t.TempDir(), "identity.secret"))

	data := []byte("some challenge bytes")
	sig, _ := p1.Sign(data)
	if p2.Verify(data, sig) {
		t.Error("expected verification to fail against a different identity")
	}
}

func TestLoadDID_MatchesLoadOrCreate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "identity.secret")
	p, err := LoadOrCreate(path)
	if err != nil {
		t.Fatalf("LoadOrCreate: %v", err)
	}

	did, err := LoadDID(path)
	if err != nil {
		t.Fatalf("LoadDID: %v", err)
	}
	if did != p.DID() {
		t.Errorf("expected LoadDID to return the same DID as LoadOrCreate, got %s vs %s", did, p.DID())
	}
}

func TestLoadDID_MissingFile_Errors(t *testing.T) {
	_, err := LoadDID(filepath.Join(t.TempDir(), "does-not-exist.secret"))
	if err == nil {
		t.Error("expected an error for a missing identity file")
	}
}
