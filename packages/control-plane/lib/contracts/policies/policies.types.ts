import { z } from "zod";
import { CreatePolicyBodySchema } from "./policies.schemas";

// ── Body types
export type CreatePolicyBody = z.infer<typeof CreatePolicyBodySchema>;

// ── Responses

/** Resource limits enforced by a policy (subset persisted as JSON). */
export interface PolicyResourceLimits {
  maxTokensPerDay?: number;
  maxRequestsPerHour?: number;
  allowedDomains?: string[];
}

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
