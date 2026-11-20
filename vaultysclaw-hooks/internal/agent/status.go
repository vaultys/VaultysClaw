package agent

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/identity"
	"github.com/vaultys/VaultysClaw/sdk-go/vconn"

	"github.com/vaultys/vaultysclaw-hooks/internal/state"
)

// Refresh cadence bounds. The cadence is a third of the configured
// maxStatusAgeSeconds, so two consecutive checks can fail before a fresh status
// ages out; clamped so a tiny bound does not hammer the control plane and an
// unbounded one still notices a revocation within minutes.
const (
	minStatusInterval = 15 * time.Second
	maxStatusInterval = 5 * time.Minute
	statusTimeout     = 30 * time.Second
)

// StatusRefresher keeps status.token current: it asks the control plane for
// the held grant's status with a signed cert_status_request and persists the
// signed cert_status_response, which every hook invocation then re-verifies
// (state.LoadPolicy). It is the only way a revocation, a kill switch, or a
// deleted custom capability reaches this host short of the grant expiring —
// the control plane answers a revocation by pushing *no* grant, and a nil token
// rightly erases nothing.
//
// It never decides anything itself and holds no state a hook relies on; losing
// it only lets the status age, which MaxStatusAge and FailClosed already govern.
type StatusRefresher struct {
	Scope    state.Scope
	Paths    state.Paths
	Anchor   *grant.Anchor
	Identity *identity.Provider
	Logger   *slog.Logger
	// Now is injectable for tests.
	Now func() time.Time

	mu       sync.Mutex
	inflight string // certId of the outstanding request, "" when none
	sentAt   time.Time
}

func (r *StatusRefresher) now() time.Time {
	if r.Now != nil {
		return r.Now()
	}
	return time.Now()
}

func (r *StatusRefresher) log() *slog.Logger {
	if r.Logger != nil {
		return r.Logger
	}
	return slog.Default()
}

// Interval is how often a held status is re-checked, from the local config's
// maxStatusAgeSeconds.
func Interval(cfg state.Config) time.Duration {
	if cfg.MaxStatusAgeSeconds < 0 {
		return maxStatusInterval
	}
	d := time.Duration(cfg.MaxStatusAgeSeconds) * time.Second / 3
	if d < minStatusInterval {
		return minStatusInterval
	}
	if d > maxStatusInterval {
		return maxStatusInterval
	}
	return d
}

// Next returns a cert_status_request envelope when the held grant's status is
// due for a check, or nothing. Suitable as (part of) a vconn Outbox.
func (r *StatusRefresher) Next() []vconn.Envelope {
	now := r.now()
	body, err := r.currentGrant(now)
	if err != nil || body == nil {
		return nil // nothing provisioned, or a grant the hook will refuse anyway
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.inflight == body.CertID && now.Sub(r.sentAt) < statusTimeout {
		return nil
	}
	if !r.due(body, now) {
		return nil
	}

	nonce, err := newNonce()
	if err != nil {
		r.log().Warn("agent: status check skipped", "err", err)
		return nil
	}
	token, err := grant.SignStatusRequest(r.Identity.VaultysID(), body.CertID, nonce, now)
	if err != nil {
		r.log().Warn("agent: status check skipped", "err", err)
		return nil
	}
	env, err := vconn.NewEnvelope(vconn.MsgCertStatusRequest, vconn.CertStatusPayload{CertToken: token})
	if err != nil {
		r.log().Warn("agent: status check skipped", "err", err)
		return nil
	}
	if r.inflight == body.CertID {
		r.log().Warn("agent: no status response within the timeout; asking again", "certId", body.CertID)
	}
	r.inflight, r.sentAt = body.CertID, now
	return []vconn.Envelope{env}
}

// due reports whether the held status for body is missing, for another
// certificate, or older than the refresh interval.
func (r *StatusRefresher) due(body *grant.Body, now time.Time) bool {
	token, err := readTrimmed(r.Paths.Status)
	if err != nil {
		return true
	}
	resp, err := grant.VerifyStatusResponse(r.Anchor.VaultysID(), token, now, 0)
	if err != nil || resp.CertID != body.CertID {
		return true
	}
	cfg, err := state.LoadConfig(r.Paths.Config)
	if err != nil {
		cfg = state.DefaultConfig()
	}
	return now.Sub(resp.CheckedAtTime()) >= Interval(cfg)
}

// Accept handles one cert_status_response token. It is persisted only if it
// verifies against the pinned anchor and is about this host's current grant;
// anything else is reported and dropped, leaving the previous status to age —
// the safe direction.
func (r *StatusRefresher) Accept(token string) error {
	now := r.now()
	resp, err := grant.VerifyStatusResponse(r.Anchor.VaultysID(), token, now, 0)
	if err != nil {
		return fmt.Errorf("agent: status response does not verify against %s; ignored: %w", r.Anchor.DID(), err)
	}
	if resp.AgentDID != r.Identity.DID() {
		return fmt.Errorf("agent: status response is about %s, not this host; ignored", resp.AgentDID)
	}
	body, err := r.currentGrant(now)
	if err != nil || body == nil {
		return fmt.Errorf("agent: status response for %s but no usable grant held; ignored", resp.CertID)
	}
	if resp.CertID != body.CertID {
		return fmt.Errorf("agent: status response for %s, but the held grant is %s; ignored", resp.CertID, body.CertID)
	}
	// Never let an older answer replace a newer one: responses can cross on a
	// reconnect, and a stale "active" must not overwrite a fresh "revoked".
	if prev, err := readTrimmed(r.Paths.Status); err == nil {
		if old, err := grant.VerifyStatusResponse(r.Anchor.VaultysID(), prev, now, 0); err == nil &&
			old.CertID == resp.CertID && old.CheckedAt > resp.CheckedAt {
			return nil
		}
	}
	if err := writeFileAtomic(r.Paths.Status, []byte(token), filePerm(r.Scope)); err != nil {
		return err
	}

	r.mu.Lock()
	if r.inflight == resp.CertID {
		r.inflight = ""
	}
	r.mu.Unlock()

	if resp.CertificateStatus() != "active" {
		r.log().Warn("agent: the control plane reports this host's certificate is no longer active — governed tool calls are refused from now on",
			"certId", resp.CertID, "status", resp.Status)
	} else {
		r.log().Debug("agent: certificate status confirmed", "certId", resp.CertID, "capabilities", resp.Capabilities)
	}
	return nil
}

func (r *StatusRefresher) currentGrant(now time.Time) (*grant.Body, error) {
	token, err := readTrimmed(r.Paths.Grant)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return grant.Verify(r.Anchor.VaultysID(), token, now)
}

func readTrimmed(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	t := strings.TrimSpace(string(data))
	if t == "" {
		return "", fmt.Errorf("%s is empty", path)
	}
	return t, nil
}

func newNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
