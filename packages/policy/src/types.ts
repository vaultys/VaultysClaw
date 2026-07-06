/**
 * Core policy engine types.
 *
 * This module is the canonical home for capability and resource-limit types.
 * `@vaultysclaw/shared` re-exports them for backward compatibility, so existing
 * imports from `@vaultysclaw/shared` continue to work unchanged.
 */

/**
 * Agent capability/permission grant.
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
  | "knowledge_search";

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
