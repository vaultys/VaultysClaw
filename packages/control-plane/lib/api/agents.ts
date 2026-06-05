import { AgentSummary } from "@/lib/api-types";
import { BaseApi } from "./base";
import { ChatHistoryMessage, ChatSession } from "@vaultysclaw/shared";
import { SafeLlmConfig } from "@/types";

export interface Agent extends AgentSummary {
  description?: string;
  realmId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentSkillOverride {
  skillId: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface PeerGrant {
  id: string;
  agentDid: string;
  peerDid: string;
  capabilities: string[];
  createdAt: string;
  expiresAt?: string;
}

export interface AgentSchedule {
  id: string;
  agentDid: string;
  cron: string;
  intent: string;
  enabled: boolean;
}

export interface AgentTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  byModel: Record<string, { input: number; output: number }>;
  period?: { from: string; to: string };
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
    return this.get<SafeLlmConfig>(`/api/agents/${did}/realm-llm`);
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
    return this.get<{ skills: AgentSkillOverride[] }>(
      `/api/agents/${did}/skills`
    );
  }

  updateSkills(did: string, skills: AgentSkillOverride[]) {
    return this.patch<{ skills: AgentSkillOverride[] }>(
      `/api/agents/${did}/skills`,
      { skills }
    );
  }

  // Token usage
  getTokenUsage(did: string, params?: { from?: string; to?: string }) {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return this.get<AgentTokenUsage>(
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
  createSchedule(did: string, data: Omit<AgentSchedule, "id" | "agentDid">) {
    return this.post<AgentSchedule>(`/api/agents/${did}/schedules`, data);
  }

  deleteSchedule(did: string, scheduleId: string) {
    return this.delete<void>(`/api/agents/${did}/schedules`, { scheduleId });
  }

  // Tasks
  sendTask(
    did: string,
    data: { intent: string; payload?: Record<string, unknown> }
  ) {
    return this.post<{ taskId: string }>(`/api/agents/${did}/tasks`, data);
  }
}

export const agentsApi = new AgentsApi();
