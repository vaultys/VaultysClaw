// Package capability holds the grammar for VaultysClaw capability names.
//
// A capability is either a built-in (a closed list that lives in code) or an
// admin-defined custom name shaped vendor:action — see
// docs/CUSTOM_CAPABILITIES.md. This package is the Go half of that grammar; the
// TypeScript half is packages/policy/src/types.ts, and the two are held together
// by conformance/capability-names.json, which both test suites run.
//
// The colon is load-bearing: it is what makes a custom name unable to collide
// with, or shadow, a present or future built-in, none of which contain one.
package capability

import "regexp"

// CustomNamePattern is the grammar for a custom capability name.
//
//   - vendor — 2-32 chars, lowercase alphanumeric + hyphen, must start alphanumeric
//   - action — 2-64 chars, lowercase alphanumeric + dot/underscore/hyphen, must start alphanumeric
//
// Exactly one colon. Lowercase-only so a name can never differ from another by
// case alone. Byte-identical to CUSTOM_CAPABILITY_RE in packages/policy.
//
// `\A`/`\z` rather than `^`/`$`: in Go, `$` also matches before a trailing
// newline, so an anchored-looking pattern would accept "acme:invoice\n". The
// conformance table pins that case precisely because it is the one place these
// two regex dialects differ.
var CustomNamePattern = regexp.MustCompile(`\A[a-z0-9][a-z0-9-]{1,31}:[a-z0-9][a-z0-9._-]{1,63}\z`)

// Builtins is the closed list of built-in capability names. Keep in sync with
// BUILTIN_CAPABILITIES in packages/policy/src/types.ts.
var Builtins = []string{
	"file_access",
	"internet_access",
	"browser_control",
	"api_call",
	"mail_send",
	"code_execution",
	"system_command",
	"agent_communication",
	"knowledge_search",
	"admin_console_access",
	"portal_access",
	"process_read",
	"non_delegatable",
	"delegation",
}

var builtinSet = func() map[string]struct{} {
	m := make(map[string]struct{}, len(Builtins))
	for _, b := range Builtins {
		m[b] = struct{}{}
	}
	return m
}()

// IsBuiltin reports whether name is one of the built-in capabilities.
func IsBuiltin(name string) bool {
	_, ok := builtinSet[name]
	return ok
}

// IsCustom reports whether name is a well-formed custom capability name.
//
// Stricter than "contains a colon": a malformed name is not a custom
// capability, so it is never resolvable — which is the safe direction.
func IsCustom(name string) bool {
	return CustomNamePattern.MatchString(name)
}

// IsValid reports whether name is a legal capability name at all — a built-in,
// or a well-formed custom name.
func IsValid(name string) bool {
	return IsBuiltin(name) || IsCustom(name)
}

// FilterAgainstRegistry drops every capability that is not currently authorized
// to exist: a built-in passes through, a custom name passes only while the
// registry still lists it, and a malformed name is dropped because it is
// neither.
//
// The Go counterpart of filterAgainstRegistry in packages/policy. A client uses
// it to apply what a cert_status_response reports; the control plane uses the
// TypeScript one to decide what that response says in the first place.
func FilterAgainstRegistry(capabilities []string, registry map[string]struct{}) []string {
	out := make([]string, 0, len(capabilities))
	for _, c := range capabilities {
		if IsBuiltin(c) {
			out = append(out, c)
			continue
		}
		if !IsCustom(c) {
			continue
		}
		if _, ok := registry[c]; ok {
			out = append(out, c)
		}
	}
	return out
}
