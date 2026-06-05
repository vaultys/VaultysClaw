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
    return this.get<Agent>(`/api/agent/${did}`);
  }

  update(
    did: string,
    data: Partial<Pick<Agent, "name" | "description" | "metadata">>
  ) {
    return this.patch<Agent>(`/api/agent/${did}`, data);
  }

  remove(did: string) {
    return this.delete<void>(`/api/agent/${did}`);
  }

  // LLM config
  getLlmConfig(did: string) {
    return this.get<{ config: SafeLlmConfig | null }>(
      `/api/agent/${did}/llm-config`
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
      `/api/agent/${did}/llm-config`,
      config
    );
  }

  deleteLlmConfig(did: string) {
    return this.delete<{ pushed: boolean }>(`/api/agent/${did}/llm-config`);
  }

  getRealmLlm(did: string) {
    return this.get<RealmLlmData>(`/api/agent/${did}/realm-llm`);
  }

  // Chat sessions
  getChatSessions(did: string) {
    return this.get<{ sessions: ChatSession[] }>(
      `/api/agent/${did}/chat-sessions`
    );
  }

  getSessionMessages(did: string, sessionId: string) {
    return this.get<{ messages: ChatHistoryMessage[] }>(
      `/api/agent/${did}/chat-sessions/${sessionId}`
    );
  }

  // Skills
  getSkills(did: string) {
    return this.get<{ skills: SkillConfig[] }>(`/api/agent/${did}/skills`);
  }

  updateSkill(did: string, skillId: string, enabled: boolean) {
    return this.patch<{ skills: SkillConfig[] }>(
      `/api/agent/${did}/skill/${skillId}`,
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
      `/api/agent/${did}/token-usage${qs ? `?${qs}` : ""}`
    );
  }

  // Peers
  listPeers(did: string) {
    return this.get<{ grants: PeerGrant[] }>(`/api/agent/${did}/peers`);
  }

  addPeer(
    did: string,
    data: { peerDid: string; capabilities: string[]; expiresAt?: string }
  ) {
    return this.post<PeerGrant>(`/api/agent/${did}/peers`, data);
  }

  getPeer(did: string, grantId: string) {
    return this.get<PeerGrant>(`/api/agent/${did}/peers/${grantId}`);
  }

  removePeer(did: string, grantId: string) {
    return this.delete<void>(`/api/agent/${did}/peers/${grantId}`);
  }

  // Schedules
  createSchedule(did: string, data: AgentSchedule) {
    return this.post<AgentSchedule>(`/api/agent/${did}/schedules`, data);
  }

  deleteSchedule(did: string, scheduleId: string) {
    return this.delete<{ agentId: string; scheduleId: string }>(
      `/api/agent/${did}/schedules/${scheduleId}`
    );
  }

  // Tasks
  sendTask(did: string, data: AgentTask) {
    return this.post<{ agentId: string; action: string }>(
      `/api/agent/${did}/task`,
      data
    );
  }
}

export const agentsApi = new AgentsApi();
