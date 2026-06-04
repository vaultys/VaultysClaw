import { BaseApi } from "./base";

export interface TokenUsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  byAgent: Record<string, { input: number; output: number }>;
  byModel: Record<string, { input: number; output: number }>;
  byRealm?: Record<string, { input: number; output: number }>;
  period?: { from: string; to: string };
}

export class StatsApi extends BaseApi {
  getTokenUsage(params?: { from?: string; to?: string; realmId?: string; agentDid?: string }) {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.realmId) query.set("realmId", params.realmId);
    if (params?.agentDid) query.set("agentDid", params.agentDid);
    const qs = query.toString();
    return this.get<TokenUsageStats>(`/api/stats/tokens${qs ? `?${qs}` : ""}`);
  }
}

export const statsApi = new StatsApi();
