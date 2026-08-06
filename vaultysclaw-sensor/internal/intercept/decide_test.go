package intercept

import (
	"strings"
	"testing"
	"time"

	"github.com/vaultys/vaultysclaw-sensor/internal/authz"
	"github.com/vaultys/vaultysclaw-sensor/internal/rules"
)

var now = time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)

func certGranting(caps []authz.Capability, limits *authz.ResourceLimits, scope *authz.CertScope) authz.Certificate {
	return authz.Certificate{
		ID:             "cert-1",
		AgentDID:       "did:vaultys:proxy",
		Capabilities:   caps,
		ResourceLimits: limits,
		Scope:          scope,
		Status:         authz.StatusActive,
		IssuedAt:       now.Add(-time.Hour).UnixMilli(),
		ExpiresAt:      nil,
	}
}

func openInternet() Config {
	return Config{
		Certs:    []authz.Certificate{certGranting([]authz.Capability{authz.CapInternetAccess}, nil, nil)},
		SyncedAt: now,
	}
}

func dest(host string, port int) rules.Destination {
	return rules.Destination{Host: host, Port: port}
}

func TestDenyRuleBeatsAnOtherwiseValidCertificate(t *testing.T) {
	// "I forbid all access to openai.com" — whatever the process, and even
	// though the certificate would otherwise permit the internet.
	cfg := openInternet()
	cfg.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com", "openai.com"}, Effect: rules.EffectDeny},
	}}

	out := Decide(cfg, dest("api.openai.com", 443), nil, now)
	if out.Allowed {
		t.Fatalf("allowed a destination under an explicit deny rule (reason %q)", out.Reason)
	}
	if out.RuleID != "deny-openai" {
		t.Errorf("ruleId = %q, want deny-openai", out.RuleID)
	}
	// The certificate must not even be credited — the rule settled it.
	if out.GrantingCertID != "" {
		t.Errorf("grantingCertId = %q, want empty", out.GrantingCertID)
	}

	// An unrelated host still goes through the certificate path.
	if out := Decide(cfg, dest("api.github.com", 443), nil, now); !out.Allowed {
		t.Errorf("unrelated host denied: %q", out.Reason)
	}
}

func TestNoInternetAccessCapabilityDeniesEgress(t *testing.T) {
	// §7's first row: the capability's absence is the policy.
	cfg := Config{
		Certs:    []authz.Certificate{certGranting([]authz.Capability{authz.CapAPICall}, nil, nil)},
		SyncedAt: now,
	}

	out := Decide(cfg, dest("api.github.com", 443), nil, now)
	if out.Allowed {
		t.Fatal("allowed egress without internet_access")
	}
	if !strings.Contains(out.Reason, "internet_access") {
		t.Errorf("reason = %q, want it to name the missing capability", out.Reason)
	}
}

func TestNoCertificatesDeniesEverything(t *testing.T) {
	if out := Decide(Config{SyncedAt: now}, dest("api.github.com", 443), nil, now); out.Allowed {
		t.Fatal("allowed egress with no certificates at all")
	}
}

func TestAllowedDomainsIsEnforced(t *testing.T) {
	// The field the admin UI collects and no other code in VaultysClaw reads
	// (§7). This is its first enforcement point.
	cfg := Config{
		Certs: []authz.Certificate{certGranting(
			[]authz.Capability{authz.CapInternetAccess},
			&authz.ResourceLimits{AllowedDomains: []string{"api.anthropic.com", ".github.com"}},
			nil,
		)},
		SyncedAt: now,
	}

	cases := []struct {
		host string
		want bool
		why  string
	}{
		{"api.anthropic.com", true, "exact entry"},
		{"api.github.com", true, "dot-prefixed suffix entry"},
		{"api.openai.com", false, "host not in the allowlist"},

		// The bypass strict matching exists to prevent: an attacker-controlled
		// domain that merely contains an allowlisted one.
		{"api.anthropic.com.evil.example", false, "suffix-appended attacker domain"},
		{"notgithub.com", false, "incidental substring"},
	}

	for _, c := range cases {
		out := Decide(cfg, dest(c.host, 443), nil, now)
		if out.Allowed != c.want {
			t.Errorf("host %q: allowed = %v, want %v (%s) — reason %q", c.host, out.Allowed, c.want, c.why, out.Reason)
		}
	}
}

func TestNoAllowedDomainsMeansNoDomainLimit(t *testing.T) {
	if out := Decide(openInternet(), dest("anything.example", 443), nil, now); !out.Allowed {
		t.Fatalf("a certificate with no allowedDomains should not limit hosts: %q", out.Reason)
	}
}

func TestScopedCertificateMatchesHostPortResource(t *testing.T) {
	// A certificate scoped to one destination must admit exactly that
	// destination — pinning the "host:port" resource form both sides agree on.
	cfg := Config{
		Certs: []authz.Certificate{certGranting(
			[]authz.Capability{authz.CapInternetAccess},
			nil,
			&authz.CertScope{Resource: "api.github.com:443"},
		)},
		SyncedAt: now,
	}

	if out := Decide(cfg, dest("api.github.com", 443), nil, now); !out.Allowed {
		t.Errorf("scoped destination denied: %q", out.Reason)
	}
	if out := Decide(cfg, dest("api.github.com", 8443), nil, now); out.Allowed {
		t.Error("a different port matched a certificate scoped to :443")
	}
	if out := Decide(cfg, dest("api.openai.com", 443), nil, now); out.Allowed {
		t.Error("a different host matched a scoped certificate")
	}
}

func TestStalenessFailsClosedOrOpenAsConfigured(t *testing.T) {
	base := openInternet()
	base.MaxStatusAge = 10 * time.Minute
	base.SyncedAt = now.Add(-time.Hour)

	closed := base
	closed.FailClosed = true
	out := Decide(closed, dest("api.github.com", 443), nil, now)
	if out.Allowed {
		t.Error("fail-closed allowed a request on a stale certificate status")
	}
	if !strings.Contains(out.Reason, "past the") {
		t.Errorf("reason = %q, want it to explain the age bound", out.Reason)
	}

	open := base
	open.FailClosed = false
	out = Decide(open, dest("api.github.com", 443), nil, now)
	if !out.Allowed {
		t.Errorf("fail-open denied a request on a stale status: %q", out.Reason)
	}
	// Continuing on a stale set is a choice, but never a silent one.
	if !strings.Contains(out.Reason, "continuing on") {
		t.Errorf("fail-open reason = %q, want it to record that the status was stale", out.Reason)
	}

	// Within the bound, nothing is reported as stale.
	fresh := closed
	fresh.SyncedAt = now.Add(-time.Minute)
	if out := Decide(fresh, dest("api.github.com", 443), nil, now); !out.Allowed || strings.Contains(out.Reason, "past the") {
		t.Errorf("fresh status: allowed = %v, reason = %q", out.Allowed, out.Reason)
	}

	// Negative means unbounded — and it has to be written explicitly.
	unbounded := base
	unbounded.MaxStatusAge = -1
	unbounded.FailClosed = true
	if out := Decide(unbounded, dest("api.github.com", 443), nil, now); !out.Allowed {
		t.Errorf("a negative MaxStatusAge should impose no bound: %q", out.Reason)
	}
}

func TestMaxStatusAgeZeroIsStrictNotPermissive(t *testing.T) {
	// The inverted-setting bug this pins: `docs/CERTIFICATE_WEB_OF_TRUST.md` §5.2
	// defines stapleTtlSeconds 0 as "force live query every time" — the strictest
	// choice an admin can make. Reading Go's zero value as "no bound" would hand
	// the most permissive behaviour to the admin who asked for the least, and an
	// earlier version of this code did exactly that.
	base := openInternet()
	base.MaxStatusAge = 0

	// Even with a status confirmed this instant, zero admits nothing cached.
	closed := base
	closed.FailClosed = true
	closed.SyncedAt = now
	out := Decide(closed, dest("api.github.com", 443), nil, now)
	if out.Allowed {
		t.Fatal("maxStatusAge 0 allowed a request — it must admit no cached status at all")
	}
	if !strings.Contains(out.Reason, "live status check") {
		t.Errorf("reason = %q, want it to explain that a live check is impossible offline", out.Reason)
	}

	// Fail-open still passes, but must say the status was not acceptable.
	open := base
	open.FailClosed = false
	open.SyncedAt = now
	out = Decide(open, dest("api.github.com", 443), nil, now)
	if !out.Allowed {
		t.Errorf("fail-open denied: %q", out.Reason)
	}
	if !strings.Contains(out.Reason, "continuing on") {
		t.Errorf("fail-open reason = %q, want it to record the unmet requirement", out.Reason)
	}

	// A deny rule is unaffected either way — it never consults the certificate.
	withRule := closed
	withRule.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny},
	}}
	if out := Decide(withRule, dest("api.openai.com", 443), nil, now); out.RuleID != "deny-openai" {
		t.Errorf("ruleId = %q, want the rule to settle it regardless of status age", out.RuleID)
	}
}

func TestDenyRuleStillAppliesWhenTheStatusIsStale(t *testing.T) {
	// A denylist does not depend on the certificate, so a stale sync must not
	// weaken it — nor should fail-closed be needed to make it hold.
	cfg := openInternet()
	cfg.MaxStatusAge = time.Minute
	cfg.SyncedAt = now.Add(-time.Hour)
	cfg.FailClosed = false
	cfg.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny},
	}}

	if out := Decide(cfg, dest("api.openai.com", 443), nil, now); out.Allowed {
		t.Fatal("a stale certificate status weakened an explicit deny rule")
	}
}

func TestAttributionMissIsFlaggedNotSilent(t *testing.T) {
	// §5.2.1: the fail-open is deliberate, but it must be countable.
	cfg := openInternet()
	cfg.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "agents-no-github", Subject: rules.SubjectAgent, Hosts: []string{".github.com"}, Effect: rules.EffectDeny},
	}}

	out := Decide(cfg, dest("api.github.com", 443), nil, now)
	if !out.Allowed {
		t.Fatalf("an undecidable subject rule should fail open: %q", out.Reason)
	}
	if !out.AttributionMissing {
		t.Error("AttributionMissing = false — an ungoverned pass was recorded as a clean one")
	}

	// With attribution, the rule bites.
	out = Decide(cfg, dest("api.github.com", 443), &rules.Attribution{IsGovernedAgent: true}, now)
	if out.Allowed {
		t.Error("a governed agent was allowed through a matching deny rule")
	}
	if out.AttributionMissing {
		t.Error("AttributionMissing = true even though attribution was supplied")
	}
}

func TestRawIPDestinationIsFlagged(t *testing.T) {
	// The coverage gap Decide documents rather than hides: hostname rules cannot
	// match an IP literal, so the outcome has to say so.
	cfg := openInternet()
	cfg.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "deny-openai", Subject: rules.SubjectAny, Hosts: []string{".openai.com"}, Effect: rules.EffectDeny},
	}}

	out := Decide(cfg, dest("104.18.0.1", 443), nil, now)
	if !out.RawIPDestination {
		t.Error("RawIPDestination = false for an IP-literal destination")
	}
	if !out.Allowed {
		t.Errorf("an IP literal with a permissive certificate should pass: %q", out.Reason)
	}

	if out := Decide(cfg, dest("api.openai.com", 443), nil, now); out.RawIPDestination {
		t.Error("RawIPDestination = true for a hostname")
	}
}

func TestEveryOutcomeCarriesAReason(t *testing.T) {
	// An unexplainable governance decision is not worth taking, so no path may
	// return an empty reason.
	cfg := openInternet()
	cfg.Rules = &rules.Set{Rules: []rules.Rule{
		{ID: "deny-a", Subject: rules.SubjectAny, Hosts: []string{"a.example"}, Effect: rules.EffectDeny},
		{ID: "allow-b", Subject: rules.SubjectAny, Hosts: []string{"b.example"}, Effect: rules.EffectAllow},
	}}

	for _, host := range []string{"a.example", "b.example", "c.example", "104.18.0.1"} {
		if out := Decide(cfg, dest(host, 443), nil, now); out.Reason == "" {
			t.Errorf("host %q produced an outcome with no reason", host)
		}
	}
	if out := Decide(Config{SyncedAt: now}, dest("c.example", 443), nil, now); out.Reason == "" {
		t.Error("a denial with no certificates produced no reason")
	}
}
