export interface Policy {
  id: string;
  capabilities: string[];
  resourceLimits: {
    allowedDomains?: string[];
    maxTokensPerDay?: number;
    maxRequestsPerHour?: number;
  } | null;
  expiresAt: string | null;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  source_type: string;
  doc_count: number;
  status: string;
}

import type { AgentInfo } from "@/lib/contracts";

export interface GraphData {
  agents: AgentInfo[];
  policies: Policy[];
  knowledge: KnowledgeSource[];
}

export interface AgentEnvironmentGraphProps {
  agentId: string;
  agentName: string;
  transport: "ws" | "peerjs" | null | undefined;
  online: boolean;
  reportedLlm: { provider: string; model: string } | null;
  capabilities: string[];
}

// ── Layout constants ──
export const COL = { agent: 180, right: 820 };
export const PEER_COL_X = -340; // left edge of peer column
export const ROW_GAP = 90;
export const NODE_H = 80; // approximate rendered node height (px)
export const TOP_PAD = NODE_H + 20; // vertical space reserved at top for knowledge row
export const KS_OFFSET = -(NODE_H + 250); // knowledge sits one box-height above agent
export const KS_SPACING = 170; // horizontal gap between knowledge node centres
