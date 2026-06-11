import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

export const governanceContract = c.router({
  summary: {
    method: "GET",
    path: "/api/governance/summary",
    summary: "Retrieve governance posture statistics",
    responses: {
      200: c.type<{
        agents: {
          total: number;
          uncovered: number;
          highRisk: number;
          highRiskList: Array<{ did: string; riskyCaps: string[] }>;
        };
        intents: { total: number; failed: number; pending: number; successRate: number };
        approvals: {
          total: number;
          approved: number;
          rejected: number;
          pending: number;
          approvalRate: number;
        };
        policies: { active: number; expired: number };
        budgets: { agentsOverDailyBudget: number; agentsOverMonthlyBudget: number };
      }>(),
      ...commonErrorResponses,
    },
  },

  audit: {
    method: "GET",
    path: "/api/governance/audit",
    summary: "Retrieve a unified audit stream of activity and intent logs",
    query: z.object({
      limit: z.coerce.number().optional(),
      source: z.enum(["activity", "intent", ""]).optional(),
      status: z.enum(["success", "failed", "pending"]).optional(),
      agentDid: z.string().optional(),
    }),
    responses: {
      200: c.type<{
        entries: Array<{
          id: string;
          source: string;
          event: string;
          agentDid: string | null;
          agentName: string | null;
          details: string | null;
          status: string | null;
          error: string | null;
          timestamp: string;
        }>;
        total: number;
      }>(),
      ...commonErrorResponses,
    },
  },

  auditEntry: {
    method: "GET",
    path: "/api/governance/audit/:id",
    pathParams: z.object({ id: z.string() }),
    summary: "Retrieve a single audit entry with full details and metadata",
    responses: {
      200: c.type<{
        entry: Record<string, unknown>;
        certInfo: Record<string, unknown>;
      }>(),
      ...commonErrorResponses,
    },
  },
});
