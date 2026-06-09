import { AgentSummary } from "@/lib/api-types";
import { BaseApi } from "./base";
import {
  ChatHistoryMessage,
  ChatSession,
  SkillConfig,
} from "@vaultysclaw/shared";
import { RealmLlmData, SafeLlmConfig, TokenUsageHistory } from "@/types";
import {
  AgentSchedule,
  AgentTask,
  TokenUsageQuery,
} from "@/types/api/requests";

export interface Agent extends AgentSummary {
  description?: string;
  realmId?: string;
  metadata?: Record<string, unknown>;
}

export interface PeerGrant {
  id: string;
  agentDid: string;
  peerDid: string;
  capabilities: string[];
  createdAt: string;
  expiresAt?: string;
}

export class AgentsApi extends BaseApi {
  list(params?: { page?: number; pageSize?: number; realm?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.realm) query.set("realm", params.realm);
    const qs = query.toString();
    return this.get<{ agents: Agent[]; total?: number }>(
      `/api/agents${qs ? `?${qs}` : ""}`
    );
  }

  search(q: string, params?: { realm?: string }) {
    const query = new URLSearchParams({ q });
    if (params?.realm) query.set("realm", params.realm);
    return this.get<{ agents: Agent[] }>(`/api/agents/search?${query}`);
  }

  getOne(did: string) {
    return this.get<Agent>(`/api/agents/${did}`);
  }

  update(
    did: string,
    data: Partial<Pick<Agent, "name" | "description" | "metadata">>
  ) {
    return this.patch<Agent>(`/api/agents/${did}`, data);
  }

  remove(did: string) {
    return this.delete<void>(`/api/agents/${did}`);
  }

  // LLM config
  getLlmConfig(did: string) {
    return this.get<{ config: SafeLlmConfig | null }>(
      `/api/agents/${did}/llm-config`
    );
  }

  setLlmConfig(
    did: string,
    config: Partial<SafeLlmConfig> & {
      registryModelId?: string;
      realmId?: string;
      realmModelId?: string;
    }
  ) {
    return this.put<{ pushed: boolean; config: SafeLlmConfig }>(
      `/api/agents/${did}/llm-config`,
      config
    );
  }

  deleteLlmConfig(did: string) {
    return this.delete<{ pushed: boolean }>(`/api/agents/${did}/llm-config`);
  }

  getRealmLlm(did: string) {
    return this.get<RealmLlmData>(`/api/agents/${did}/realm-llm`);
  }

  // Chat sessions
  getChatSessions(did: string) {
    return this.get<{ sessions: ChatSession[] }>(
      `/api/agents/${did}/chat-sessions`
    );
  }

  getSessionMessages(did: string, sessionId: string) {
    return this.get<{ messages: ChatHistoryMessage[] }>(
      `/api/agents/${did}/chat-sessions/${sessionId}`
    );
  }

  // Skills
  getSkills(did: string) {
    return this.get<{ skills: SkillConfig[] }>(`/api/agents/${did}/skills`);
  }

  updateSkill(did: string, skillId: string, enabled: boolean) {
    return this.patch<{ skills: SkillConfig[] }>(
      `/api/agents/${did}/skill/${skillId}`,
      {
        enabled,
      }
    );
  }

  // Token usage
  getTokenUsage(did: string, params?: TokenUsageQuery) {
    const query = new URLSearchParams();
    if (params?.granularity) query.set("granularity", params.granularity);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return this.get<TokenUsageHistory>(
      `/api/agents/${did}/token-usage${qs ? `?${qs}` : ""}`
    );
  }

  // Peers
  listPeers(did: string) {
    return this.get<{ grants: PeerGrant[] }>(`/api/agents/${did}/peers`);
  }

  addPeer(
    did: string,
    data: { peerDid: string; capabilities: string[]; expiresAt?: string }
  ) {
    return this.post<PeerGrant>(`/api/agents/${did}/peers`, data);
  }

  getPeer(did: string, grantId: string) {
    return this.get<PeerGrant>(`/api/agents/${did}/peers/${grantId}`);
  }

  removePeer(did: string, grantId: string) {
    return this.delete<void>(`/api/agents/${did}/peers/${grantId}`);
  }

  // Schedules
  createSchedule(did: string, data: AgentSchedule) {
    return this.post<AgentSchedule>(`/api/agents/${did}/schedules`, data);
  }

  deleteSchedule(did: string, scheduleId: string) {
    return this.delete<{ agentId: string; scheduleId: string }>(
      `/api/agents/${did}/schedules/${scheduleId}`
    );
  }

  // Tasks
  sendTask(did: string, data: AgentTask) {
    return this.post<{ agentId: string; action: string }>(
      `/api/agents/${did}/task`,
      data
    );
  }
}

export const agentsApi = new AgentsApi();
