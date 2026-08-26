/**
 * Core policy engine types.
 *
 * This module is the canonical home for capability and resource-limit types.
 * `@vaultysclaw/shared` re-exports them for backward compatibility, so existing
 * imports from `@vaultysclaw/shared` continue to work unchanged.
 */

/**
 * Agent capability/permission grant.
 *
 * `admin_console_access` and `portal_access` are not agent behaviors — they're
 * *interface* access rights for human Principals (docs/REBUILD_ARCHITECTURE.md
 * §4.5: "access to any interface is itself just a capability, not a parallel
 * RBAC layer"). They live in the same enum deliberately, so the exact same
 * certificate/ledger/`resolvePermission` machinery gates both "can this agent
 * read this file" and "can this human open the admin console" — no separate
 * role system to keep in sync.
 */
export type BuiltinCapability =
  | "file_access"
  | "internet_access"
  | "browser_control"
  | "api_call"
  | "mail_send"
  | "code_execution"
  | "system_command"
  | "agent_communication"
  | "knowledge_search"
  | "admin_console_access"
  | "portal_access"
  // Sensor-kind Actors have no general capability model (vaultysclaw-sensor
  // gates its telemetry entirely on this one flag today; more will follow as
  // the sensor grows more capabilities to gate independently).
  | "process_read"
  // ── Delegation-chain groundwork (schema-only for now — see
  // packages/controlplane/CLAUDE.md "Actor categories, devices & delegation" and
  // CapabilityCertificate's delegatedByDid/parentCertId/parentCertHash fields there) ──
  // A plain capability, usable today with no special-cased column: if it appears anywhere in a
  // certificate's `capabilities`, that whole certificate can never be the parent of a future
  // delegation chain (not per-capability — the whole cert).
  | "non_delegatable"
  // Reserved marker for a future delegation-format certificate (cert B: capabilities delegated
  // from a parent cert A, co-signed by the delegator and the delegate, no control-plane
  // signature). Not yet produced by any issuance code, and deliberately not offered in any
  // capability-selection UI — exposing it today would let someone fabricate a cert that claims to
  // be a delegation without the actual dual-signature/parent-chain guarantees a real one requires.
  | "delegation";

/**
 * An admin-defined capability, namespaced `vendor:action` (e.g. `acme:invoice.approve`) —
 * docs/CUSTOM_CAPABILITIES.md.
 *
 * The colon is load-bearing: it is what makes a custom name unable to collide with, or shadow, a
 * present or future {@link BuiltinCapability}, none of which contain one.
 *
 * This type is deliberately **coarse** — `"acme:"` and `"a:b:c"` both satisfy it, because
 * TypeScript template literals can't express the real grammar. Never treat the type as
 * validation: every boundary that accepts a name from outside (a form post, a manifest file, a
 * `register` payload, a DB row) must call {@link assertValidCapabilityName}, which is the single
 * source of truth for what is actually legal.
 */
export type CustomCapability = `${string}:${string}`;

/**
 * Agent capability/permission grant — a built-in, or an admin-defined `vendor:action` name.
 *
 * Widening this from a closed union means **exhaustiveness checking no longer applies**: a
 * `switch` or `Record<AgentCapability, …>` over it silently stops being checked rather than
 * failing to compile. Anything mapping capabilities to labels/icons must carry an explicit
 * fallback for an unrecognized name (in practice: the registry's label, or the raw name).
 */
export type AgentCapability = BuiltinCapability | CustomCapability;

/**
 * The real grammar for a custom capability name: `vendor:action`.
 *
 * - vendor — 2-32 chars, lowercase alphanumeric + hyphen, must start alphanumeric
 * - action — 2-64 chars, lowercase alphanumeric + dot/underscore/hyphen, must start alphanumeric
 *
 * Exactly one colon. Lowercase-only so a name can never differ from another by case alone —
 * `Acme:x` and `acme:x` resolving to different grants would be a security footgun, and the
 * database's unique index is case-sensitive.
 *
 * `sdk-go` carries a byte-identical regex; a change here must change both, and the shared
 * fixture table in `conformance/` is what keeps them honest.
 */
export const CUSTOM_CAPABILITY_RE = /^[a-z0-9][a-z0-9-]{1,31}:[a-z0-9][a-z0-9._-]{1,63}$/;

/** The built-in capability names, as a runtime value. Keep in sync with {@link BuiltinCapability}. */
export const BUILTIN_CAPABILITIES = [
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
] as const satisfies readonly BuiltinCapability[];

const BUILTIN_SET: ReadonlySet<string> = new Set(BUILTIN_CAPABILITIES);

/** True for one of the built-in names above — never for a `vendor:action` name. */
export function isBuiltinCapability(capability: string): capability is BuiltinCapability {
  return BUILTIN_SET.has(capability);
}

/**
 * True for a **well-formed** custom capability name.
 *
 * Stricter than the {@link CustomCapability} type, deliberately: this is the predicate to branch
 * on when deciding whether a held name must be checked against the registry. A malformed name is
 * not a custom capability, so it is never resolvable — which is the safe direction.
 */
export function isCustomCapability(capability: string): capability is CustomCapability {
  return CUSTOM_CAPABILITY_RE.test(capability);
}

/**
 * Throw unless `capability` is a legal capability name — a built-in, or a well-formed
 * `vendor:action`.
 *
 * The error messages are user-facing (surfaced by the admin registry form and by the SDK's
 * manifest loader) and are asserted against in tests — keep them stable.
 */
export function assertValidCapabilityName(capability: string): void {
  if (isBuiltinCapability(capability)) return;
  if (!capability.includes(":")) {
    throw new Error(
      `Invalid capability name "${capability}": a custom capability must be namespaced as "vendor:action"`
    );
  }
  if (!CUSTOM_CAPABILITY_RE.test(capability)) {
    throw new Error(
      `Invalid capability name "${capability}": expected "vendor:action" — lowercase, vendor 2-32 chars [a-z0-9-], action 2-64 chars [a-z0-9._-], exactly one colon`
    );
  }
}

/** Split a validated custom name into its parts. Throws for anything not a legal custom name. */
export function parseCustomCapability(capability: string): { vendor: string; action: string } {
  assertValidCapabilityName(capability);
  if (!isCustomCapability(capability)) {
    throw new Error(`"${capability}" is a built-in capability, not a custom one`);
  }
  const colon = capability.indexOf(":");
  return { vendor: capability.slice(0, colon), action: capability.slice(colon + 1) };
}

/**
 * Runtime constraints embedded in the agent certificate alongside capabilities.
 * All fields are optional — omitting a field means no limit for that dimension.
 */
export interface ResourceLimits {
  maxTokensPerDay?: number;
  maxRequestsPerHour?: number;
  allowedDomains?: string[];
}

/**
 * Resource limits enforced by a policy (subset persisted as JSON).
 *
 * Structurally identical to {@link ResourceLimits}; kept as a named alias so the
 * API contract layer can refer to the wire shape explicitly.
 */
export type PolicyResourceLimits = ResourceLimits;

/**
 * A policy as serialized over the wire (dates as ISO strings, capabilities as
 * a string array). This is the single source of truth for the policy shape
 * consumed by the UI.
 */
export interface PolicyEntry {
  id: string;
  agentDid: string | null;
  workspaceId: string | null;
  capabilities: string[];
  resourceLimits: PolicyResourceLimits | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

/**
 * Attribute-based scoping for a capability certificate
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.6). Embedded in the signed
 * {@link CapabilityGrantBody} payload, so it lives here rather than in
 * `@vaultysclaw/trust` — it's part of the wire format, not the decision logic.
 * `@vaultysclaw/trust` imports this type rather than redeclaring it.
 *
 * Omitting every field makes a certificate "standing" — it authorizes its
 * capabilities against any resource. Deliberately a small structured shape,
 * not an expression language.
 */
export interface CertScope {
  /** Exact resource identifier this grant applies to, e.g. "file:///reports/q3.pdf". */
  resource?: string;
  /** Glob pattern (single trailing "*" wildcard) for the resource. */
  resourcePattern?: string;
  /** Maximum number of times this certificate may authorize an action. */
  maxUses?: number;
  /** Free-text audit tag, e.g. "quarterly-report-export". */
  purpose?: string;
}

/**
 * Drop every capability that is not currently authorized to exist.
 *
 * The single implementation of "fail closed on a deleted custom capability"
 * (docs/CUSTOM_CAPABILITIES.md): a built-in passes through, a custom name passes
 * only while the registry still lists it, and a **malformed** name is dropped —
 * it is neither, and an unresolvable name is the safe outcome.
 *
 * Lives here rather than in the control plane because it is pure name semantics,
 * which is what this module owns, and because both the status-response path and
 * the grant-delivery path need it without either owning it.
 */
export function filterAgainstRegistry(
  capabilities: readonly string[],
  registryNames: ReadonlySet<string>
): AgentCapability[] {
  return capabilities.filter(
    (c) => isBuiltinCapability(c) || (isCustomCapability(c) && registryNames.has(c))
  ) as AgentCapability[];
}
