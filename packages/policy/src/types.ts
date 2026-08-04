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
export type AgentCapability =
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
  | "process_read";

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
