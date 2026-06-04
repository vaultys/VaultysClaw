import { ChannelSummary } from "@/lib/api-types";
import { BaseApi } from "./base";

export interface Channel extends ChannelSummary {
  description?: string;
  type?: "text" | "voice" | "dm";
  metadata?: Record<string, unknown>;
}

export interface ChannelMember {
  did: string;
  name?: string;
  role?: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderDid: string;
  content: string;
  type?: "text" | "image" | "file";
  threadId?: string;
  reactions?: Record<string, string[]>;
  editedAt?: string;
  createdAt: string;
}

export interface ChannelThread {
  id: string;
  channelId: string;
  rootMessageId: string;
  messageCount: number;
  createdAt: string;
}

export interface ChannelBridge {
  id: string;
  channelId: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export class ChannelsApi extends BaseApi {
  list(params?: { realm?: string; includeGlobal?: boolean; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.realm) query.set("realm", params.realm);
    if (params?.includeGlobal) query.set("includeGlobal", "true");
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const qs = query.toString();
    return this.get<{ channels: Channel[]; total: number }>(`/api/channels${qs ? `?${qs}` : ""}`);
  }

  create(data: Pick<Channel, "name" | "realmId"> & Partial<Pick<Channel, "description" | "isPublic" | "type">>) {
    return this.post<Channel>("/api/channels", data);
  }

  getOne(id: string) {
    return this.get<Channel>(`/api/channels/${id}`);
  }

  update(id: string, data: Partial<Pick<Channel, "name" | "description" | "isPublic">>) {
    return this.patch<Channel>(`/api/channels/${id}`, data);
  }

  remove(id: string) {
    return this.delete<void>(`/api/channels/${id}`);
  }

  // Members
  addMember(id: string, data: { did: string; role?: ChannelMember["role"] }) {
    return this.post<ChannelMember>(`/api/channels/${id}/members`, data);
  }

  removeMember(id: string, did: string) {
    return this.delete<void>(`/api/channels/${id}/members`, { did });
  }

  // Messages
  listMessages(id: string, params?: { page?: number; pageSize?: number; before?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.before) query.set("before", params.before);
    const qs = query.toString();
    return this.get<{ messages: ChannelMessage[]; total: number }>(
      `/api/channels/${id}/messages${qs ? `?${qs}` : ""}`
    );
  }

  postMessage(id: string, data: Pick<ChannelMessage, "content"> & Partial<Pick<ChannelMessage, "type" | "threadId">>) {
    return this.post<ChannelMessage>(`/api/channels/${id}/messages`, data);
  }

  getMessage(id: string, msgId: string) {
    return this.get<ChannelMessage>(`/api/channels/${id}/messages/${msgId}`);
  }

  editMessage(id: string, msgId: string, data: Pick<ChannelMessage, "content">) {
    return this.patch<ChannelMessage>(`/api/channels/${id}/messages/${msgId}`, data);
  }

  deleteMessage(id: string, msgId: string) {
    return this.delete<void>(`/api/channels/${id}/messages/${msgId}`);
  }

  addReaction(id: string, msgId: string, emoji: string) {
    return this.post<void>(`/api/channels/${id}/messages/${msgId}/reactions`, { emoji });
  }

  postAgentResponse(id: string, data: { agentDid: string; content: string; threadId?: string }) {
    return this.post<ChannelMessage>(`/api/channels/${id}/messages/agent-response`, data);
  }

  // Threads
  listThreads(id: string) {
    return this.get<{ threads: ChannelThread[] }>(`/api/channels/${id}/threads`);
  }

  createThread(id: string, data: { rootMessageId: string }) {
    return this.post<ChannelThread>(`/api/channels/${id}/threads`, data);
  }

  // Bridges
  listBridges(id: string) {
    return this.get<{ bridges: ChannelBridge[] }>(`/api/channels/${id}/bridges`);
  }

  createBridge(id: string, data: Pick<ChannelBridge, "type" | "config">) {
    return this.post<ChannelBridge>(`/api/channels/${id}/bridges`, data);
  }

  updateBridge(id: string, bridgeId: string, data: Partial<Pick<ChannelBridge, "config" | "enabled">>) {
    return this.patch<ChannelBridge>(`/api/channels/${id}/bridges/${bridgeId}`, data);
  }

  removeBridge(id: string, bridgeId: string) {
    return this.delete<void>(`/api/channels/${id}/bridges/${bridgeId}`);
  }
}

export const channelsApi = new ChannelsApi();
