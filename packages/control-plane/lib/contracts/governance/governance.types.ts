import { z } from "zod";
import { AuditQuerySchema } from "./governance.schemas";

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
    approvalRate: number;
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

/** A single audit entry with full details + certificate metadata. */
export interface AuditEntryDetail {
  entry: Record<string, unknown>;
  certInfo: Record<string, unknown>;
}
