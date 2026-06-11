// `AgentDetail` is derived from the ts-rest contract (the same schema the
// `GET /api/agents/:did` route validates against), keeping the UI type in lock
// step with the API response.
export type { AgentDetail } from "@/lib/contracts";

export interface PolicyEntry {
  id: string;
  agentDid: string | null;
  realmId: string | null;
  capabilities: string[];
  resourceLimits: {
    maxTokensPerDay?: number;
    maxRequestsPerHour?: number;
    allowedDomains?: string[];
  } | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

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
