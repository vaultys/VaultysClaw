// Package authz decides whether an action is authorized by a set of
// concurrently held capability certificates.
//
// This is a deliberate, faithful port of packages/trust/src/resolve-permission.ts
// (docs/CERTIFICATE_WEB_OF_TRUST.md §3.6). Two implementations of an
// authorization function that disagree are a vulnerability, not an
// inconvenience, so the port is held to the TypeScript original by shared
// vectors in conformance/permission-vectors.json — executed by both
// conformance_test.go here and packages/trust/__tests__/conformance.test.ts
// there. Deny reason strings are part of that contract: they are user-facing
// and asserted against, exactly as packages/policy/CLAUDE.md requires.
//
// Pure by design, mirroring the TypeScript package's own rule: no I/O, no
// mutation, and the clock is a parameter. Callers own certificate fetching and
// signature verification — by the time a certificate reaches this package its
// signature has already been checked (see internal/grant).
package authz

import (
	"fmt"
	"regexp"
	"strings"
)

// CertificateStatus mirrors the CapabilityCertificate.status column: only
// "active" ever authorizes anything.
type CertificateStatus string

const (
	StatusActive     CertificateStatus = "active"
	StatusRevoked    CertificateStatus = "revoked"
	StatusSuperseded CertificateStatus = "superseded"
	StatusExpired    CertificateStatus = "expired"
)

// Capability is one entry of packages/policy's AgentCapability union. Kept as
// a plain string rather than a Go enum: the catalog is owned by the
// TypeScript side, and an unrecognized capability must fail closed by simply
// not matching, never by failing to parse.
type Capability string

// Well-known capabilities this package's callers gate on today. The full
// catalog lives in packages/policy/src/types.ts; these are declared only for
// use as constants in the intercept path.
const (
	CapInternetAccess Capability = "internet_access"
	CapAPICall        Capability = "api_call"
)

// CertScope is the ABAC attribute-scoping shape (trust doc §3.6). A zero
// CertScope — no Resource and no ResourcePattern — is an unscoped certificate
// and matches any resource.
type CertScope struct {
	Resource        string `json:"resource,omitempty"`
	ResourcePattern string `json:"resourcePattern,omitempty"`
	// MaxUses is nil for "no use limit". Zero is a real value meaning the
	// certificate is already exhausted, so this cannot be a plain int.
	MaxUses *int   `json:"maxUses,omitempty"`
	Purpose string `json:"purpose,omitempty"`
}

// ResourceLimits mirrors packages/policy's ResourceLimits. Not consulted by
// Resolve — these are enforced by separate gates (see internal/intercept for
// AllowedDomains, the one this repo enforces first) — but carried on the
// certificate so a caller can reach them without a second lookup.
type ResourceLimits struct {
	MaxTokensPerDay    *int     `json:"maxTokensPerDay,omitempty"`
	MaxRequestsPerHour *int     `json:"maxRequestsPerHour,omitempty"`
	AllowedDomains     []string `json:"allowedDomains,omitempty"`
}

// Certificate is the minimal shape Resolve needs — the Go twin of
// CapabilityCertificateLite. Times are milliseconds since the Unix epoch, to
// match the TypeScript representation exactly rather than translating to
// time.Time and back at the comparison that decides expiry.
type Certificate struct {
	ID             string            `json:"id"`
	AgentDID       string            `json:"agentDid"`
	Capabilities   []Capability      `json:"capabilities"`
	ResourceLimits *ResourceLimits   `json:"resourceLimits,omitempty"`
	Scope          *CertScope        `json:"scope,omitempty"`
	Status         CertificateStatus `json:"status"`
	IssuedAt       int64             `json:"issuedAt"`
	// ExpiresAt is nil for a certificate that does not auto-expire (rare —
	// trust doc §3.3).
	ExpiresAt *int64 `json:"expiresAt"`
	UsedCount int    `json:"usedCount,omitempty"`
}

// RequestedAction is the action being evaluated.
//
// Resource is a *string, not a string, because the TypeScript original
// distinguishes an absent resource (a scoped certificate cannot match, since
// there is nothing to check it against) from an empty one. Collapsing the two
// would quietly change the decision for scoped certificates.
type RequestedAction struct {
	Capability Capability `json:"capability"`
	Resource   *string    `json:"resource,omitempty"`
}

// Res is a convenience constructor for an action's optional resource:
// authz.RequestedAction{Capability: authz.CapInternetAccess, Resource: authz.Res(host)}.
func Res(s string) *string { return &s }

// Decision is the result of Resolve. Reason is populated only when Allowed is
// false, and is suitable for an audit record or a client-facing error.
type Decision struct {
	Allowed        bool   `json:"allowed"`
	GrantingCertID string `json:"grantingCertId,omitempty"`
	Reason         string `json:"reason,omitempty"`
}

// Resolve reports whether action is authorized by any certificate in certs.
//
// certs should be every certificate held by the acting principal: filtering by
// status or expiry is this function's job, not the caller's, so that the two
// invariants packages/trust/CLAUDE.md declares — revoking never grants more
// access, adding never removes it except through explicit scope-narrowing
// supersession — hold regardless of what the caller passes in.
//
// nowMs is milliseconds since the Unix epoch.
func Resolve(action RequestedAction, certs []Certificate, nowMs int64) Decision {
	for _, cert := range certs {
		if !isUsable(cert, nowMs) {
			continue
		}
		if !hasCapability(cert, action.Capability) {
			continue
		}
		if !scopeMatches(cert.Scope, action.Resource) {
			continue
		}
		return Decision{Allowed: true, GrantingCertID: cert.ID}
	}
	return Decision{Allowed: false, Reason: denyReason(action)}
}

// denyReason reproduces the TypeScript original's two message forms. The
// choice between them is a truthiness test on action.resource there, so an
// empty-string resource takes the short form — a nil check here instead of
// this explicit empty check would diverge on that case, which
// conformance/permission-vectors.json pins.
func denyReason(action RequestedAction) string {
	if action.Resource != nil && *action.Resource != "" {
		return fmt.Sprintf(
			"No active certificate grants '%s' for resource '%s'",
			action.Capability, *action.Resource,
		)
	}
	return fmt.Sprintf("No active certificate grants '%s'", action.Capability)
}

// isUsable reports whether a certificate is usable at all, independent of the
// requested action.
func isUsable(cert Certificate, nowMs int64) bool {
	if cert.Status != StatusActive {
		return false
	}
	if cert.ExpiresAt != nil && *cert.ExpiresAt <= nowMs {
		return false
	}
	if cert.Scope != nil && cert.Scope.MaxUses != nil && cert.UsedCount >= *cert.Scope.MaxUses {
		return false
	}
	return true
}

func hasCapability(cert Certificate, want Capability) bool {
	for _, c := range cert.Capabilities {
		if c == want {
			return true
		}
	}
	return false
}

// scopeMatches reports whether a certificate's scope admits the requested
// resource. An unscoped certificate matches anything; a scoped one requires a
// resource to check against, so an action with no resource never matches it.
func scopeMatches(scope *CertScope, requested *string) bool {
	var resource, pattern string
	if scope != nil {
		resource = scope.Resource
		pattern = scope.ResourcePattern
	}

	if resource == "" && pattern == "" {
		return true // unscoped — matches any resource
	}
	if requested == nil {
		return false // scoped certificate requires a resource to check
	}
	if resource != "" && resource == *requested {
		return true
	}
	if pattern != "" && matchesPattern(pattern, *requested) {
		return true
	}
	return false
}

// matchesPattern matches value against a '*'-glob pattern.
//
// A pattern containing no '*' is compared as a literal string and never
// compiled — so regex metacharacters in it stay literal. A pattern with '*'
// has each literal segment regex-quoted before the wildcards become '.*',
// which is why "mcp://s.rv/*" does not authorize "mcp://sxrv/tool".
func matchesPattern(pattern, value string) bool {
	if !strings.Contains(pattern, "*") {
		return pattern == value
	}
	parts := strings.Split(pattern, "*")
	for i, part := range parts {
		parts[i] = regexp.QuoteMeta(part)
	}
	re, err := regexp.Compile("^" + strings.Join(parts, ".*") + "$")
	if err != nil {
		// Unreachable with quoted segments, but a malformed pattern must
		// never widen access.
		return false
	}
	return re.MatchString(value)
}
