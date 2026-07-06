import {
  Channel,
  ChannelMember,
  ChannelMessage,
  MessageMetadata,
} from "@vaultysclaw/shared";
import {
  ChannelDAO,
  ChannelMemberDAO,
  ChannelMessageDAO,
  WorkspaceDAO,
  UserDAO,
  prisma,
} from "@/db";
import { MessageDispatcher } from "./message-dispatcher";

/**
 * ChannelService provides business logic for channel management
 * - Create/delete channels
 * - Add/remove members with role management
 * - Post/edit/delete messages with threading
 * - Search messages
 * - Handle reactions
 */
export class ChannelService {
  /**
   * Resolve display names for a set of DIDs (agents and users).
   * Returns a map did → display name; DIDs without a known name are omitted.
   * Agent names take precedence over user names on collision.
   */
  static async resolveDisplayNames(
    dids: string[]
  ): Promise<Record<string, string>> {
    const unique = [...new Set(dids)].filter(Boolean);
    if (unique.length === 0) return {};

    const [agents, users] = await Promise.all([
      prisma.agent.findMany({
        where: { did: { in: unique } },
        select: { did: true, name: true },
      }),
      prisma.user.findMany({
        where: { did: { in: unique } },
        select: { did: true, name: true, email: true },
      }),
    ]);

    const map: Record<string, string> = {};
    for (const u of users) {
      const name = u.name ?? u.email;
      if (u.did && name) map[u.did] = name;
    }
    for (const a of agents) {
      if (a.name) map[a.did] = a.name;
    }
    return map;
  }

  /**
   * Attach resolved author display names to messages
   */
  static async withAuthorNames(
    messages: ChannelMessage[]
  ): Promise<ChannelMessage[]> {
    const nameMap = await this.resolveDisplayNames(
      messages.map((m) => m.authorDid)
    );
    return messages.map((m) => ({
      ...m,
      authorName: nameMap[m.authorDid] ?? null,
    }));
  }

  /**
   * Attach resolved member display names to channel members
   */
  static async withMemberNames(
    members: ChannelMember[]
  ): Promise<ChannelMember[]> {
    const nameMap = await this.resolveDisplayNames(
      members.map((m) => m.memberDid)
    );
    return members.map((m) => ({
      ...m,
      memberName: nameMap[m.memberDid] ?? null,
    }));
  }

  /**
   * Create a new channel
   */
  static async createChannel(input: {
    name: string;
    slug: string;
    workspaceId?: string; // undefined/null = global channel
    description?: string;
    isPublic?: boolean;
    topic?: string;
    creatorDid: string;
  }): Promise<Channel> {
    // Validate slug (alphanumeric, hyphens, underscores only)
    if (!/^[a-z0-9_-]+$/.test(input.slug)) {
      throw new Error(
        "Channel slug must contain only lowercase letters, numbers, hyphens, and underscores"
      );
    }

    // Check for duplicate slug within workspace/global scope
    const existing = await ChannelDAO.findBySlug(input.slug, input.workspaceId);
    if (existing) {
      throw new Error(`Channel #${input.slug} already exists in this scope`);
    }

    const channel = await ChannelDAO.create({
      name: input.name,
      slug: input.slug,
      workspaceId: input.workspaceId ?? undefined,
      description: input.description ?? undefined,
      isPublic: input.isPublic ?? true,
      isArchived: false,
      topic: input.topic ?? undefined,
      creatorDid: input.creatorDid,
    });

    // Add creator as channel owner
    await ChannelMemberDAO.add({
      channelId: channel.id,
      memberDid: input.creatorDid,
      memberType: "user",
      role: "owner",
    });

    return channel as unknown as Channel;
  }

  /**
   * Get channel by ID
   */
  static async getChannel(channelId: string): Promise<Channel | null> {
    return (await ChannelDAO.findById(channelId)) as unknown as Channel | null;
  }

  /**
   * List channels in a workspace (includes global channels)
   */
  static async listChannels(workspaceId: string): Promise<Channel[]> {
    return (await ChannelDAO.listByWorkspaceWithGlobal(workspaceId)) as unknown as Channel[];
  }

  /**
   * List only global channels
   */
  static async listGlobalChannels(): Promise<Channel[]> {
    return (await ChannelDAO.listGlobal()) as unknown as Channel[];
  }

  /**
   * Update channel metadata
   */
  static async updateChannel(
    channelId: string,
    updates: {
      name?: string;
      description?: string;
      topic?: string;
      isPublic?: boolean;
    }
  ): Promise<Channel> {
    await ChannelDAO.update(channelId, updates);
    const channel = await ChannelDAO.findById(channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }
    return channel as unknown as Channel;
  }

  /**
   * Archive a channel (soft delete - members can still view history)
   */
  static async archiveChannel(channelId: string): Promise<void> {
    await ChannelDAO.update(channelId, { isArchived: true });
  }

  /**
   * Permanently delete a channel (cascades to messages and members)
   */
  static async deleteChannel(channelId: string): Promise<void> {
    await ChannelDAO.delete(channelId);
  }

  /**
   * Add a member to a channel
   */
  static async addChannelMember(input: {
    channelId: string;
    memberDid: string;
    memberType: "user" | "agent";
    role?: "member" | "moderator" | "owner";
    invitedBy?: string;
  }): Promise<ChannelMember> {
    // Check member isn't already in channel
    const existing = await ChannelMemberDAO.findMembership(
      input.channelId,
      input.memberDid
    );
    if (existing) {
      throw new Error(`Member ${input.memberDid} is already in this channel`);
    }

    return (await ChannelMemberDAO.add({
      channelId: input.channelId,
      memberDid: input.memberDid,
      memberType: input.memberType,
      role: input.role ?? "member",
      invitedBy: input.invitedBy,
    })) as unknown as ChannelMember;
  }

  /**
   * Remove a member from a channel
   */
  static async removeChannelMember(
    channelId: string,
    memberDid: string
  ): Promise<void> {
    await ChannelMemberDAO.remove(channelId, memberDid);
  }

  /**
   * Get all members of a channel
   */
  static async getChannelMembers(channelId: string): Promise<ChannelMember[]> {
    return (await ChannelMemberDAO.listByChannel(channelId)) as unknown as ChannelMember[];
  }

  /**
   * Check if a member is in a channel
   */
  static async isMember(channelId: string, memberDid: string): Promise<boolean> {
    const member = await ChannelMemberDAO.findMembership(channelId, memberDid);
    if (member !== null) return true;

    // Workspace members have implicit access to all channels in their workspace
    const channel = await ChannelDAO.findById(channelId);
    if (!channel?.workspaceId) return false;

    const user = await UserDAO.findByDid(memberDid);
    if (!user) return false;

    return WorkspaceDAO.isUserInWorkspace(user.id, channel.workspaceId);
  }

  /**
   * Get member role in a channel
   */
  static async getMemberRole(
    channelId: string,
    memberDid: string
  ): Promise<"member" | "moderator" | "owner" | null> {
    const member = await ChannelMemberDAO.findMembership(channelId, memberDid);
    return (member?.role as "member" | "moderator" | "owner") ?? null;
  }

  /**
   * Update member role
   */
  static async updateMemberRole(
    channelId: string,
    memberDid: string,
    role: "member" | "moderator" | "owner"
  ): Promise<ChannelMember> {
    await ChannelMemberDAO.updateRole(channelId, memberDid, role);
    const member = await ChannelMemberDAO.findMembership(channelId, memberDid);
    if (!member) {
      throw new Error("Channel member not found");
    }
    return member as unknown as ChannelMember;
  }

  /**
   * Post a message to a channel
   */
  static async postMessage(input: {
    channelId: string;
    authorDid: string;
    authorType: "user" | "agent";
    content: string;
    threadId?: string;
    metadata?: MessageMetadata;
  }): Promise<ChannelMessage> {
    const message = await ChannelMessageDAO.create({
      channelId: input.channelId,
      threadId: input.threadId ?? undefined,
      authorDid: input.authorDid,
      authorType: input.authorType,
      content: input.content,
      metadata: (input.metadata as Record<string, unknown>) ?? {},
    });

    // Process mentions and fan out to bridges (async, fire-and-forget).
    // Only for user-authored top-level messages — agent replies and thread
    // posts skip dispatch to avoid re-processing already-dispatched content.
    if (input.authorType === "user" && !input.threadId) {
      MessageDispatcher.processMessage(
        input.channelId,
        message.id,
        input.authorDid,
        input.content,
        {
          id: message.id,
          authorType: "user",
          threadId: message.threadId,
          createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
        }
      ).catch((err) => console.error("MessageDispatcher error:", err));
    }

    return message as unknown as ChannelMessage;
  }

  /**
   * Create a threaded message (response to a mention)
   * Returns the new message with threadId set to parentMessageId
   */
  static async createThreadReply(input: {
    channelId: string;
    parentMessageId: string;
    authorDid: string;
    authorType: "user" | "agent";
    content: string;
    metadata?: MessageMetadata;
  }): Promise<ChannelMessage> {
    // Verify parent message exists and is in the channel
    const parentMessage = await ChannelMessageDAO.findById(input.parentMessageId);
    if (!parentMessage || parentMessage.channelId !== input.channelId) {
      throw new Error("Parent message not found in this channel");
    }

    return (await ChannelMessageDAO.create({
      channelId: input.channelId,
      threadId: input.parentMessageId,
      authorDid: input.authorDid,
      authorType: input.authorType,
      content: input.content,
      metadata: (input.metadata as Record<string, unknown>) ?? {},
    })) as unknown as ChannelMessage;
  }

  /**
   * Get a message by ID
   */
  static async getMessage(messageId: string): Promise<ChannelMessage | null> {
    return (await ChannelMessageDAO.findById(messageId)) as unknown as ChannelMessage | null;
  }

  /**
   * List messages in a channel (top-level only, excludes threads)
   */
  static async listMessages(
    channelId: string,
    limit?: number,
    before?: string
  ): Promise<ChannelMessage[]> {
    return (await ChannelMessageDAO.listByChannel(channelId, limit, before)) as unknown as ChannelMessage[];
  }

  /**
   * Get all replies in a thread
   */
  static async getThread(parentMessageId: string): Promise<ChannelMessage[]> {
    return (await ChannelMessageDAO.listThread(parentMessageId)) as unknown as ChannelMessage[];
  }

  /**
   * Edit a message (updates content)
   */
  static async editMessage(messageId: string, content: string): Promise<ChannelMessage> {
    const message = await ChannelMessageDAO.findById(messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    await ChannelMessageDAO.update(messageId, content);
    const updated = await ChannelMessageDAO.findById(messageId);
    return updated as unknown as ChannelMessage;
  }

  /**
   * Soft delete a message (sets deletedAt timestamp)
   */
  static async deleteMessage(messageId: string): Promise<void> {
    await ChannelMessageDAO.softDelete(messageId);
  }

  /**
   * Permanently delete a message
   */
  static async hardDeleteMessage(messageId: string): Promise<void> {
    await prisma.channelMessage.delete({ where: { id: messageId } });
  }

  /**
   * Add a reaction to a message
   */
  static async addReaction(
    messageId: string,
    emoji: string,
    memberDid: string
  ): Promise<ChannelMessage> {
    await ChannelMessageDAO.addReaction(messageId, emoji, memberDid);
    const message = await ChannelMessageDAO.findById(messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    return message as unknown as ChannelMessage;
  }

  /**
   * Remove a reaction from a message
   */
  static async removeReaction(
    messageId: string,
    emoji: string,
    memberDid: string
  ): Promise<ChannelMessage> {
    await ChannelMessageDAO.removeReaction(messageId, emoji, memberDid);
    const message = await ChannelMessageDAO.findById(messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    return message as unknown as ChannelMessage;
  }

  /**
   * Search messages in a channel
   */
  static async searchMessages(
    channelId: string,
    query: string,
    limit?: number
  ): Promise<ChannelMessage[]> {
    return (await ChannelMessageDAO.searchInChannel(channelId, query, limit)) as unknown as ChannelMessage[];
  }

  /**
   * Get channel statistics
   */
  static async getChannelStats(channelId: string): Promise<{
    messageCount: number;
    memberCount: number;
  }> {
    const [messageCount, memberCount] = await Promise.all([
      ChannelMessageDAO.getChannelMessageCount(channelId),
      ChannelMemberDAO.getChannelMemberCount(channelId),
    ]);
    return { messageCount, memberCount };
  }

  /**
   * Get all channels a member belongs to
   */
  static async getChannelsForMember(memberDid: string): Promise<Channel[]> {
    const members = await ChannelMemberDAO.listByMember(memberDid);
    const channels = await Promise.all(
      members.map((m) => ChannelDAO.findById(m.channelId))
    );
    return channels.filter((c) => c !== null) as unknown as Channel[];
  }
}
