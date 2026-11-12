package agent

import (
	"bytes"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"
	"github.com/vaultys/vaultysid/go/pkg/vaultysid"

	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// controlPlane re-derives the conformance fixtures' throwaway control-plane key
// (seed 0x2a, see conformance/generate-*-fixture.ts) so a test can sign grants
// and status responses for its own host, the way the real control plane would.
func controlPlane(t *testing.T, anchor *grant.Anchor) *vaultysid.VaultysID {
	t.Helper()
	cp, err := vaultysid.MachineFromEntropy(bytes.Repeat([]byte{0x2a}, 32))
	if err != nil {
		t.Fatal(err)
	}
	if cp.DID() != anchor.DID() {
		t.Fatalf("derived control plane %s is not the pinned anchor %s", cp.DID(), anchor.DID())
	}
	return cp
}

type statusEnv struct {
	p      state.Paths
	anchor *grant.Anchor
	cp     *vaultysid.VaultysID
	id     *identity.Provider
	r      *StatusRefresher
	now    time.Time
}

func newStatusEnv(t *testing.T) *statusEnv {
	t.Helper()
	p, anchor := setup(t)
	id, err := identity.LoadOrCreate(p.Identity)
	if err != nil {
		t.Fatal(err)
	}
	e := &statusEnv{p: p, anchor: anchor, cp: controlPlane(t, anchor), id: id, now: time.Now()}
	e.r = &StatusRefresher{Scope: state.ScopeUser, Paths: p, Anchor: anchor, Identity: id, Now: func() time.Time { return e.now }}
	return e
}

var heldCaps = []string{"file_read", "file_write", "code_execution"}

func (e *statusEnv) writeGrant(t *testing.T, certID string) {
	t.Helper()
	token, err := grant.Sign(e.cp, grant.Body{
		Type: "capability_grant", CertID: certID, AgentDID: e.id.DID(),
		GrantedCapabilities: heldCaps, IssuedAt: e.now.Add(-time.Hour).UnixMilli(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(e.p.Grant, []byte(token), 0o600); err != nil {
		t.Fatal(err)
	}
}

func (e *statusEnv) response(t *testing.T, certID, agentDID, status string, caps []string, checked time.Time) string {
	t.Helper()
	token, err := grant.Sign(e.cp, grant.StatusResponse{
		Type: "cert_status_response", CertID: certID, AgentDID: agentDID,
		Status: status, Capabilities: caps, CheckedAt: checked.UnixMilli(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func (e *statusEnv) policy(t *testing.T) state.Policy {
	t.Helper()
	pol, err := state.LoadPolicy(e.p, e.now)
	if err != nil {
		t.Fatal(err)
	}
	return pol
}

func TestRefresherRequestsASignedCheckOnlyWhenDue(t *testing.T) {
	e := newStatusEnv(t)
	if msgs := e.r.Next(); len(msgs) != 0 {
		t.Fatal("no grant held: nothing to check")
	}
	e.writeGrant(t, "cert-1")

	msgs := e.r.Next()
	if len(msgs) != 1 || msgs[0].Type != vconn.MsgCertStatusRequest {
		t.Fatalf("a held grant with no status must be checked, got %v", msgs)
	}
	var payload vconn.CertStatusPayload
	if err := msgs[0].Decode(&payload); err != nil {
		t.Fatal(err)
	}
	req, err := grant.VerifyStatusRequest(e.id.VaultysID(), payload.CertToken)
	if err != nil || req.CertID != "cert-1" || req.RequesterDID != e.id.DID() {
		t.Fatalf("request must be signed by this host for its grant: req=%+v err=%v", req, err)
	}
	if len(e.r.Next()) != 0 {
		t.Fatal("one request in flight at a time")
	}
	e.now = e.now.Add(statusTimeout + time.Second)
	if len(e.r.Next()) != 1 {
		t.Fatal("an unanswered request must be re-sent after the timeout")
	}

	if err := e.r.Accept(e.response(t, "cert-1", e.id.DID(), "active", heldCaps, e.now)); err != nil {
		t.Fatal(err)
	}
	if len(e.r.Next()) != 0 {
		t.Fatal("a fresh status must not be re-checked")
	}
	e.now = e.now.Add(Interval(state.DefaultConfig()) + time.Second)
	if len(e.r.Next()) != 1 {
		t.Fatal("an aged status must be re-checked")
	}
}

func TestSignedStatusDrivesThePolicy(t *testing.T) {
	e := newStatusEnv(t)
	e.writeGrant(t, "cert-1")
	if pol := e.policy(t); pol.StatusSource != state.StatusFromPush || pol.Certs[0].Status != authz.StatusActive {
		t.Fatalf("before any check the push is the source: %+v", pol)
	}

	checked := e.now.Add(time.Minute) // later than the grant's write time
	e.now = checked
	if err := e.r.Accept(e.response(t, "cert-1", e.id.DID(), "active", []string{"file_read"}, checked)); err != nil {
		t.Fatal(err)
	}
	pol := e.policy(t)
	if pol.StatusSource != state.StatusFromCheck || !pol.SyncedAt.Equal(time.UnixMilli(checked.UnixMilli())) {
		t.Fatalf("a signed status is the freshness: %+v", pol)
	}
	if caps := pol.Certs[0].Capabilities; len(caps) != 1 || caps[0] != "file_read" {
		t.Fatalf("the response's capabilities replace the grant's: %v", caps)
	}

	e.now = e.now.Add(time.Minute)
	if err := e.r.Accept(e.response(t, "cert-1", e.id.DID(), "revoked", heldCaps, e.now)); err != nil {
		t.Fatal(err)
	}
	if st := e.policy(t).Certs[0].Status; st != authz.StatusRevoked {
		t.Fatalf("a revocation must reach the policy, got %q", st)
	}

	// A later push of the same grant does not un-revoke: a push carries no status.
	e.writeGrant(t, "cert-1")
	if st := e.policy(t).Certs[0].Status; st != authz.StatusRevoked {
		t.Fatalf("a push must not overrule a signed revocation, got %q", st)
	}
	// A re-issued certificate starts again from its push.
	e.writeGrant(t, "cert-2")
	if pol := e.policy(t); pol.Certs[0].Status != authz.StatusActive || pol.StatusSource != state.StatusFromPush {
		t.Fatalf("a status for another certificate is stale, not binding: %+v", pol)
	}
}

func TestAcceptRefusesWhatIsNotOurs(t *testing.T) {
	e := newStatusEnv(t)
	e.writeGrant(t, "cert-1")

	other, _ := vaultysid.GenerateMachine()
	forged, err := grant.Sign(other, grant.StatusResponse{Type: "cert_status_response", CertID: "cert-1", AgentDID: e.id.DID(), Status: "active", CheckedAt: e.now.UnixMilli()})
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"forged":         forged,
		"other cert":     e.response(t, "cert-9", e.id.DID(), "active", heldCaps, e.now),
		"other host":     e.response(t, "cert-1", "did:vaultys:someone-else", "active", heldCaps, e.now),
		"not a response": mustRead(t, e.p.Grant),
	}
	for name, token := range cases {
		if err := e.r.Accept(token); err == nil {
			t.Errorf("%s: must be refused", name)
		}
	}
	if _, err := os.Stat(e.p.Status); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("nothing refused may be written")
	}
}

func TestOlderResponseNeverReplacesNewer(t *testing.T) {
	e := newStatusEnv(t)
	e.writeGrant(t, "cert-1")
	if err := e.r.Accept(e.response(t, "cert-1", e.id.DID(), "revoked", heldCaps, e.now)); err != nil {
		t.Fatal(err)
	}
	if err := e.r.Accept(e.response(t, "cert-1", e.id.DID(), "active", heldCaps, e.now.Add(-time.Minute))); err != nil {
		t.Fatal(err)
	}
	if st := e.policy(t).Certs[0].Status; st != authz.StatusRevoked {
		t.Fatalf("a stale active must not overwrite a fresh revoked, got %q", st)
	}
}

func TestTamperedStatusIsAnErrorNotNoStatus(t *testing.T) {
	e := newStatusEnv(t)
	e.writeGrant(t, "cert-1")
	if err := os.WriteFile(e.p.Status, []byte("bm90IGEgdG9rZW4="), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := state.LoadPolicy(e.p, e.now); err == nil {
		t.Fatal("an unverifiable status file must fail the policy load — ignoring it would drop a revocation")
	}
}

func TestInterval(t *testing.T) {
	cases := map[int]time.Duration{-1: maxStatusInterval, 0: minStatusInterval, 30: minStatusInterval, 300: 100 * time.Second, 86400: maxStatusInterval}
	for age, want := range cases {
		if got := Interval(state.Config{MaxStatusAgeSeconds: age}); got != want {
			t.Errorf("Interval(%d) = %s, want %s", age, got, want)
		}
	}
}

func mustRead(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}
