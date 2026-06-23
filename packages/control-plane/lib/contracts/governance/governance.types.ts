import { z } from "zod";
import { AuditQuerySchema } from "./governance.schemas";
import type { PolicyResourceLimits } from "../policies/policies.types";

// ── Query types
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

// ── Responses

/** Governance posture statistics (GET /api/governance/summary). */
export interface GovernanceSummary {
  agents: {
    total: number;
    uncovered: number;
    highRisk: number;
    highRiskList: Array<{ did: string; riskyCaps: string[] }>;
  };
  intents: {
    total: number;
    failed: number;
    pending: number;
    successRate: number;
  };
  approvals: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    approvalRate: number | null;
  };
  policies: { active: number; expired: number };
  budgets: { agentsOverDailyBudget: number; agentsOverMonthlyBudget: number };
}

/** A single entry in the unified audit stream (activity_log + intent_log). */
export interface AuditEntry {
  id: string;
  source: "activity" | "intent";
  event: string;
  agentDid: string | null;
  agentName: string | null;
  details: string | null;
  status: string | null;
  error: string | null;
  timestamp: string;
}

export interface AuditResponse {
  entries: AuditEntry[];
  total: number;
}

/**
 * A single audit entry expanded with its full payload and parsed details
 * (GET /api/governance/audit/:id → `entry`). Activity entries omit the
 * intent-only `intentSignature` field.
 */
export interface AuditEntryDetail {
  id: string;
  source: "activity" | "intent";
  event: string;
  agentDid: string | null;
  agentName: string | null;
  details: string | null;
  detailsParsed: unknown;
  status: string | null;
  error: string | null;
  timestamp: string;
  params: unknown;
  output: unknown;
  sentAt: string;
  completedAt: string | null;
  durationMs: number | null;
  intentSignature?: string | null;
}

/** Certificate + cryptographic state derived from an agent's stored cert. */
export interface AuditCertInfo {
  protocol: string | null;
  state: number | null;
  certTimestamp: number | null;
  error: string | null;
  pk1Did: string | null;
  pk2Did: string | null;
  pk1Bytes: string | null;
  signatureVerified: boolean;
  signedPayload: string | null;
  capabilities: string[] | null;
  resourceLimits: PolicyResourceLimits | null;
  policyId: string | null;
  policyExpiresAt: string | null;
  rawMetadata: unknown;
}

/** Full response for GET /api/governance/audit/:id. */
export interface AuditEntryDetailResponse {
  entry: AuditEntryDetail;
  certInfo: AuditCertInfo | null;
}

/** Structured payload recorded for `tool_execution` activity entries. */
export interface ToolExecutionDetails {
  intentId?: string;
  conversationId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
}
