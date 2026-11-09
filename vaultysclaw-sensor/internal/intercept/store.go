package intercept

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/vaultys/VaultysClaw/sdk-go/authz"
	"github.com/vaultys/VaultysClaw/sdk-go/grant"
	"github.com/vaultys/VaultysClaw/sdk-go/rules"
)

// Store holds the verified decision inputs and reloads them from disk.
//
// Everything it serves has been checked against the pinned control-plane
// identity: the capability grant via grant.Verify, the rule set via
// rules.VerifySet. Nothing reaches Decide on an unverified path, which is what
// makes the config channel's trustworthiness irrelevant — the flaw §9 identifies
// in the earlier implementation, where a rule arriving over the socket was
// believed because it arrived over the socket.
//
// Both artefacts are files rather than in-memory pushes deliberately. A restart
// must resume enforcing without waiting for a connection, and a file is also
// where the control plane's push will land once §12's actor_config exists — so
// the same verification path serves both provisioning routes.
type Store struct {
	anchor      *grant.Anchor
	grantPath   string
	ruleSetPath string
	statusPath  string
	// localDID is this host's own identity. A grant naming anyone else is
	// refused: its signature is valid, but it was not granted to this host, and
	// enforcing it would let a more permissive grant issued to another Actor be
	// copied here and used (VC-05).
	localDID string

	// AttributionAvailable is whether this deployment can resolve subjects. In
	// `explicit` mode it is false, and Reload then refuses a rule set containing
	// subject-scoped rules rather than letting them silently never match.
	attributionAvailable bool
	// allowUnprovisioned — see StoreOptions.
	allowUnprovisioned bool

	mu       sync.RWMutex
	certs    []authz.Certificate
	ruleSet  *rules.Set
	syncedAt time.Time
	// The status assertion currently in force, if any: which certificate it is
	// for and its sequence number, so an older assertion cannot be swapped back
	// in over a newer one (replaying a pre-revocation "active").
	statusCertID string
	statusSeq    int64
	// loaded is set by the first successful Reload; see the missing-grant case.
	loaded bool
}

// StoreOptions configures a Store.
type StoreOptions struct {
	Anchor      *grant.Anchor
	GrantPath   string
	RuleSetPath string
	// StatusPath holds the control plane's signed status assertion for the
	// grant (sdk-go/grant.Status). Its signed checkedAt is what the staleness
	// bound measures from — never a file's mtime, which `touch` rewrites.
	//
	// A grant with no status file is *unconfirmed*: it is loaded as active, but
	// with no sync time, so under any finite MaxStatusAge it is already stale
	// and decides as the fail mode says. Only an explicitly unbounded
	// deployment (MaxStatusAge < 0) enforces on it as-is.
	StatusPath string
	// LocalDID is this host's DID; required. See Store.localDID.
	LocalDID string
	// AttributionAvailable — see Store.attributionAvailable.
	AttributionAvailable bool
	// AllowUnprovisioned permits starting with no capability grant on disk yet.
	//
	// False — the default, and what the intercept role uses — makes a missing
	// grant fatal: a proxy that will refuse every request looks identical to one
	// that is working, and the operator should learn the difference at startup.
	//
	// True is for a client that *expects to be sent* its grant, over a connection
	// it can only open after starting. Without this such a client cannot
	// bootstrap at all: it needs a grant to start and can only obtain one by
	// starting. The state is safe to run in because an empty certificate set
	// authorizes nothing — under `explicit` every governed call is denied, and
	// under `observe` every call is recorded as one that would have been. It is
	// still a state an operator must be told about, so the caller logs it.
	AllowUnprovisioned bool
}

// ErrNoGrant means no capability grant has been provisioned, so this
// interception point has been granted nothing and can authorize nothing.
var ErrNoGrant = errors.New("intercept: no capability grant provisioned")

// NewStore builds a Store and performs the first load. It returns an error
// rather than an empty Store when nothing is provisioned: starting a proxy that
// will refuse every request looks identical to a proxy that is working, and the
// operator should learn the difference at startup.
func NewStore(opts StoreOptions) (*Store, error) {
	if opts.Anchor == nil {
		return nil, errors.New("intercept: a pinned control-plane anchor is required")
	}
	if strings.TrimSpace(opts.LocalDID) == "" {
		return nil, errors.New("intercept: this host's DID is required, to refuse a grant issued to another Actor")
	}
	s := &Store{
		anchor:               opts.Anchor,
		grantPath:            opts.GrantPath,
		ruleSetPath:          opts.RuleSetPath,
		statusPath:           opts.StatusPath,
		localDID:             opts.LocalDID,
		attributionAvailable: opts.AttributionAvailable,
		allowUnprovisioned:   opts.AllowUnprovisioned,
	}
	if err := s.Reload(); err != nil {
		return nil, err
	}
	return s, nil
}

// Provisioned reports whether a verified grant is currently in force. False
// means this Store authorizes nothing — see StoreOptions.AllowUnprovisioned.
func (s *Store) Provisioned() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.certs) > 0
}

// Reload re-reads and re-verifies both artefacts, swapping them in atomically
// only if *both* verify.
//
// All-or-nothing on purpose: applying a fresh grant alongside a stale rule set,
// or vice versa, would enforce a combination no admin ever authored. On any
// failure the previously verified state stays in force, which is the safe
// direction — a corrupt push must not silently widen access by dropping the
// rules half.
func (s *Store) Reload() error {
	var certs []authz.Certificate
	var syncedAt time.Time
	var statusCertID string
	var statusSeq int64
	s.mu.RLock()
	loaded := s.loaded
	s.mu.RUnlock()

	token, err := readToken(s.grantPath)
	switch {
	case err == nil:
		body, verr := grant.Verify(s.anchor.VaultysID(), token, time.Now())
		if verr != nil {
			return signatureError("capability grant", s.grantPath, s.anchor.DID(), verr)
		}
		if err := body.BindTo(s.localDID); err != nil {
			return fmt.Errorf("intercept: refusing the grant at %s: %w", s.grantPath, err)
		}

		// The signature proves what was granted, never that it is still
		// granted. Current status comes from the control plane's separate,
		// signed assertion, and freshness from *its* signed checkedAt.
		status := authz.StatusActive
		st, serr := s.readStatus(body)
		switch {
		case serr != nil:
			return serr
		case st != nil:
			status, _ = st.CertificateStatus() // VerifyStatus already rejected unknown words
			syncedAt = time.UnixMilli(st.CheckedAt)
			statusCertID = st.CertID
			statusSeq = st.Sequence()
		default:
			// No assertion: unconfirmed. syncedAt stays zero, so any finite
			// bound treats it as stale. Deliberately not the file's mtime.
		}
		certs = []authz.Certificate{body.ToCertificate(status)}
	case os.IsNotExist(err) && loaded:
		// The grant was removed after this Store had loaded one — the control
		// plane said there is none (revoked, withheld) or a kill switch dropped
		// it. Withdrawal, not corruption, so it applies rather than leaving the
		// previous grant in force: the safe direction here is "nothing".
	case os.IsNotExist(err) && s.allowUnprovisioned:
		// No grant yet. Left empty rather than erroring: an empty certificate set
		// authorizes nothing, which is the safe direction, and this client is
		// expected to receive its grant over a connection it cannot open before
		// starting.
	case os.IsNotExist(err):
		return fmt.Errorf("%w: expected a packcert grant at %s", ErrNoGrant, s.grantPath)
	default:
		return err
	}

	var ruleSet *rules.Set
	if strings.TrimSpace(s.ruleSetPath) != "" {
		switch rulesToken, err := readToken(s.ruleSetPath); {
		case err == nil:
			ruleSet, err = rules.VerifySet(s.anchor.VaultysID(), rulesToken)
			if err != nil {
				return signatureError("rule set", s.ruleSetPath, s.anchor.DID(), err)
			}
			if err := ruleSet.Validate(s.attributionAvailable); err != nil {
				return fmt.Errorf("intercept: %w", err)
			}
			// The rule set says nothing about the grant's status, so it does
			// not refresh syncedAt. It used to (by mtime), which let every rule
			// re-signing — or a `touch` — extend a revoked grant's life.
		case os.IsNotExist(err):
			// No rule set is a valid configuration: every request is then
			// decided by the certificate alone.
		default:
			return err
		}
	}

	s.mu.Lock()
	s.certs = certs
	s.ruleSet = ruleSet
	s.syncedAt = syncedAt
	s.statusCertID = statusCertID
	s.statusSeq = statusSeq
	s.loaded = true
	s.mu.Unlock()
	return nil
}

// ErrStaleStatus means a status assertion older than the one in force was
// presented for the same certificate. Refused so a captured pre-revocation
// "active" cannot be put back on disk to undo a revocation.
var ErrStaleStatus = errors.New("intercept: status assertion is older than the one in force")

// readStatus loads and checks the status assertion for body. Nil, nil when
// there is none.
func (s *Store) readStatus(body *grant.Body) (*grant.Status, error) {
	if strings.TrimSpace(s.statusPath) == "" {
		return nil, nil
	}
	token, err := readToken(s.statusPath)
	switch {
	case os.IsNotExist(err):
		return nil, nil
	case err != nil:
		return nil, err
	}
	st, err := grant.VerifyStatus(s.anchor.VaultysID(), token)
	if err != nil {
		return nil, signatureError("grant status", s.statusPath, s.anchor.DID(), err)
	}
	if err := st.Bind(body, s.localDID); err != nil {
		// A status for some other certificate is not a status for this one.
		// Most often a new grant arrived and its status has not yet: treat the
		// grant as unconfirmed rather than failing the whole reload.
		if st.CertID != body.CertID {
			return nil, nil
		}
		return nil, fmt.Errorf("intercept: refusing the grant status at %s: %w", s.statusPath, err)
	}
	s.mu.RLock()
	curCert, curSeq := s.statusCertID, s.statusSeq
	s.mu.RUnlock()
	if curCert == st.CertID && st.Sequence() < curSeq {
		return nil, fmt.Errorf("%w (certificate %s: seq %d < %d)", ErrStaleStatus, st.CertID, st.Sequence(), curSeq)
	}
	return st, nil
}

// HeldCertID is the id of the grant currently in force, or "" when none.
func (s *Store) HeldCertID() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.certs) == 0 {
		return ""
	}
	return s.certs[0].ID
}

// ConfigFor builds the decision Config, suitable for Proxy.ConfigFor.
func (s *Store) ConfigFor(maxStatusAge time.Duration, failClosed bool) func() Config {
	return func() Config {
		s.mu.RLock()
		defer s.mu.RUnlock()
		return Config{
			Rules:        s.ruleSet,
			Certs:        s.certs,
			MaxStatusAge: maxStatusAge,
			SyncedAt:     s.syncedAt,
			FailClosed:   failClosed,
		}
	}
}

// Summary describes what is currently in force, for a startup log line. An
// operator has to be able to see what the proxy will actually enforce without
// reading the spool.
func (s *Store) Summary() string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	caps := "none"
	domains := "unrestricted"
	if len(s.certs) > 0 {
		c := s.certs[0]
		if len(c.Capabilities) > 0 {
			parts := make([]string, 0, len(c.Capabilities))
			for _, cap := range c.Capabilities {
				parts = append(parts, string(cap))
			}
			caps = strings.Join(parts, ",")
		}
		if c.ResourceLimits != nil && len(c.ResourceLimits.AllowedDomains) > 0 {
			domains = strings.Join(c.ResourceLimits.AllowedDomains, ",")
		}
	}
	// Both lists, reported separately. Counting only the host rules read
	// "rules=0" on a host running a full set of resource rules — a summary line
	// an operator uses to confirm what is in force must not say nothing is.
	hostRules, resourceRules := 0, 0
	if s.ruleSet != nil {
		hostRules = len(s.ruleSet.Rules)
		resourceRules = len(s.ruleSet.ResourceRules)
	}
	status := "none"
	if len(s.certs) > 0 {
		status = string(s.certs[0].Status)
	}
	confirmed := "never"
	if !s.syncedAt.IsZero() {
		confirmed = s.syncedAt.UTC().Format(time.RFC3339)
	}
	return fmt.Sprintf("capabilities=%s allowedDomains=%s hostRules=%d resourceRules=%d status=%s statusConfirmedAt=%s",
		caps, domains, hostRules, resourceRules, status, confirmed)
}

// readToken reads a token file, tolerating trailing whitespace from an operator
// echoing one in.
func readToken(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	token := strings.TrimSpace(string(data))
	if token == "" {
		return "", fmt.Errorf("intercept: %s is empty", path)
	}
	return token, nil
}

// signatureError explains a failed signature check in terms of what actually
// goes wrong in practice.
//
// The bare error is "invalid signature", which is true and useless: it says
// nothing about *whose* signature was expected, and the overwhelmingly common
// cause is not a forged artefact but a control plane whose identity changed —
// a reset database regenerates `serverSecret`, and every artefact signed by the
// old key then fails against the anchor pinned from the new one. That failure is
// fatal at startup, so an operator meets it as a supervisor that will not launch
// with no indication of which file to remove.
//
// Deliberately not softened into a warning. A rule set that does not verify
// cannot be loaded, and continuing without it would silently drop every deny it
// carried — the one direction this design never degrades in. The fix is to say
// which file, whose signature was expected, and that deleting it is safe because
// the control plane re-pushes it on connect.
func signatureError(kind, path, anchorDID string, err error) error {
	if !errors.Is(err, grant.ErrBadSignature) {
		return fmt.Errorf("intercept: verifying the %s: %w", kind, err)
	}
	return fmt.Errorf(
		"intercept: the %s at %s was not signed by the pinned control-plane identity (%s).\n"+
			"The usual cause is that the control plane's identity changed — resetting its database "+
			"regenerates the key it signs with — so an artefact written by the previous one can no longer verify.\n"+
			"Deleting that file is safe when a control plane is configured: it is re-pushed on connect. "+
			"If the identity is genuinely meant to have changed, re-pin it by updating controlPlaneId and removing the anchor: %w",
		kind, path, anchorDID, err)
}
