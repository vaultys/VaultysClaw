export interface AgentDetail {
  id: string;
  name: string;
  capabilities: string[];
  publicKey: string | null;
  certificateInfo: Record<string, unknown> | null;
  agentVaultysId: Record<string, unknown> | null;
  registeredAt: string;
  lastSeen: string;
  online: boolean;
  connectedAt: string | null;
  lastHeartbeat: string | null;
  reportedLlm: { provider: string; model: string } | null;
  storedLlm: { provider: string; model: string } | null;
  transport?: "ws" | "peerjs" | null;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  tokenBudgetDaily: number | null;
  tokenBudgetMonthly: number | null;
  todayTokens: number;
  monthTokens: number;
  locationLat: number | null;
  locationLon: number | null;
  locationLabel: string | null;
}

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
