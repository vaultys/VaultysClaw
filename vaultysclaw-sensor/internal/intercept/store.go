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

	// AttributionAvailable is whether this deployment can resolve subjects. In
	// `explicit` mode it is false, and Reload then refuses a rule set containing
	// subject-scoped rules rather than letting them silently never match.
	attributionAvailable bool

	mu       sync.RWMutex
	certs    []authz.Certificate
	ruleSet  *rules.Set
	syncedAt time.Time
}

// StoreOptions configures a Store.
type StoreOptions struct {
	Anchor      *grant.Anchor
	GrantPath   string
	RuleSetPath string
	// AttributionAvailable — see Store.attributionAvailable.
	AttributionAvailable bool
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
	s := &Store{
		anchor:               opts.Anchor,
		grantPath:            opts.GrantPath,
		ruleSetPath:          opts.RuleSetPath,
		attributionAvailable: opts.AttributionAvailable,
	}
	if err := s.Reload(); err != nil {
		return nil, err
	}
	return s, nil
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
	token, err := readToken(s.grantPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%w: expected a packcert grant at %s", ErrNoGrant, s.grantPath)
		}
		return err
	}

	body, err := grant.Verify(s.anchor.VaultysID(), token, time.Now())
	if err != nil {
		return fmt.Errorf("intercept: verifying the capability grant: %w", err)
	}

	// The control plane asserts current status separately from the signature
	// (see internal/grant). Until §12's actor_config push exists there is no
	// live assertion to read, so a provisioned grant is taken as active and the
	// staleness bound is measured from when it was provisioned — the file's
	// mtime. That is a real, checkable timestamp, not an assumption that the
	// grant is fresh.
	certs := []authz.Certificate{body.ToCertificate(authz.StatusActive)}
	syncedAt := fileModTime(s.grantPath)

	var ruleSet *rules.Set
	if strings.TrimSpace(s.ruleSetPath) != "" {
		switch rulesToken, err := readToken(s.ruleSetPath); {
		case err == nil:
			ruleSet, err = rules.VerifySet(s.anchor.VaultysID(), rulesToken)
			if err != nil {
				return fmt.Errorf("intercept: verifying the rule set: %w", err)
			}
			if err := ruleSet.Validate(s.attributionAvailable); err != nil {
				return fmt.Errorf("intercept: %w", err)
			}
			if t := fileModTime(s.ruleSetPath); t.After(syncedAt) {
				syncedAt = t
			}
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
	s.mu.Unlock()
	return nil
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
	ruleCount := 0
	if s.ruleSet != nil {
		ruleCount = len(s.ruleSet.Rules)
	}
	return fmt.Sprintf("capabilities=%s allowedDomains=%s rules=%d provisionedAt=%s",
		caps, domains, ruleCount, s.syncedAt.UTC().Format(time.RFC3339))
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

func fileModTime(path string) time.Time {
	if info, err := os.Stat(path); err == nil {
		return info.ModTime()
	}
	return time.Time{}
}
