import { Channel, ChannelMember, ChannelMessage, ChannelInput, ChannelMemberInput, ChannelMessageInput, MessageMetadata } from "@vaultysclaw/shared";
import { ChannelDao } from "./channel-dao";
import { ChannelMemberDao } from "./channel-member-dao";
import { ChannelMessageDao } from "./channel-message-dao";
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
   * Create a new channel
   */
  static createChannel(input: {
    name: string;
    slug: string;
    realmId?: string; // undefined/null = global channel
    description?: string;
    isPublic?: boolean;
    topic?: string;
    creatorDid: string;
  }): Channel {
    // Validate slug (alphanumeric, hyphens, underscores only)
    if (!/^[a-z0-9_-]+$/.test(input.slug)) {
      throw new Error("Channel slug must contain only lowercase letters, numbers, hyphens, and underscores");
    }

    // Check for duplicate slug within realm/global scope
    const existing = ChannelDao.getBySlug(input.slug, input.realmId);
    if (existing) {
      throw new Error(`Channel #${input.slug} already exists in this scope`);
    }

    const channel = ChannelDao.create({
      name: input.name,
      slug: input.slug,
      realmId: input.realmId || null,
      description: input.description || null,
      isPublic: input.isPublic ?? true,
      isArchived: false,
      topic: input.topic || null,
      creatorDid: input.creatorDid,
    });

    // Add creator as channel owner
    ChannelMemberDao.addMember({
      channelId: channel.id,
      memberDid: input.creatorDid,
      memberType: "user",
      role: "owner",
      invitedBy: null,
    });

    return channel;
  }

  /**
   * Get channel by ID
   */
  static getChannel(channelId: string): Channel | null {
    return ChannelDao.getById(channelId);
  }

  /**
   * List channels in a realm (includes global channels)
   */
  static listChannels(realmId: string): Channel[] {
    return ChannelDao.listByRealmWithGlobal(realmId);
  }

  /**
   * List only global channels
   */
  static listGlobalChannels(): Channel[] {
    return ChannelDao.listGlobal();
  }

  /**
   * Update channel metadata
   */
  static updateChannel(
    channelId: string,
    updates: {
      name?: string;
      description?: string;
      topic?: string;
      isPublic?: boolean;
    },
  ): Channel {
    return ChannelDao.update(channelId, updates);
  }

  /**
   * Archive a channel (soft delete - members can still view history)
   */
  static archiveChannel(channelId: string): void {
    ChannelDao.archive(channelId);
  }

  /**
   * Permanently delete a channel (cascades to messages and members)
   */
  static deleteChannel(channelId: string): void {
    ChannelDao.delete(channelId);
  }

  /**
   * Add a member to a channel
   */
  static addChannelMember(input: {
    channelId: string;
    memberDid: string;
    memberType: "user" | "agent";
    role?: "member" | "moderator" | "owner";
    invitedBy?: string;
  }): ChannelMember {
    // Check member isn't already in channel
    const existing = ChannelMemberDao.getMember(input.channelId, input.memberDid);
    if (existing) {
      throw new Error(`Member ${input.memberDid} is already in this channel`);
    }

    return ChannelMemberDao.addMember({
      channelId: input.channelId,
      memberDid: input.memberDid,
      memberType: input.memberType,
      role: input.role ?? "member",
      invitedBy: input.invitedBy || null,
    });
  }

  /**
   * Remove a member from a channel
   */
  static removeChannelMember(channelId: string, memberDid: string): void {
    ChannelMemberDao.removeMember(channelId, memberDid);
  }

  /**
   * Get all members of a channel
   */
  static getChannelMembers(channelId: string): ChannelMember[] {
    return ChannelMemberDao.listByChannel(channelId);
  }

  /**
   * Check if a member is in a channel
   */
  static isMember(channelId: string, memberDid: string): boolean {
    const member = ChannelMemberDao.getMember(channelId, memberDid);
    return member !== null;
  }

  /**
   * Get member role in a channel
   */
  static getMemberRole(channelId: string, memberDid: string): "member" | "moderator" | "owner" | null {
    const member = ChannelMemberDao.getMember(channelId, memberDid);
    return member?.role ?? null;
  }

  /**
   * Update member role
   */
  static updateMemberRole(
    channelId: string,
    memberDid: string,
    role: "member" | "moderator" | "owner",
  ): ChannelMember {
    return ChannelMemberDao.updateRole(channelId, memberDid, role);
  }

  /**
   * Post a message to a channel
   */
  static postMessage(input: {
    channelId: string;
    authorDid: string;
    authorType: "user" | "agent";
    content: string;
    threadId?: string;
    metadata?: MessageMetadata;
  }): ChannelMessage {
    const message = ChannelMessageDao.create({
      channelId: input.channelId,
      threadId: input.threadId ?? null,
      authorDid: input.authorDid,
      authorType: input.authorType,
      content: input.content,
      metadata: input.metadata ?? {},
    });

    // Process mentions and create threads (async, no await)
    if (input.authorType === "user" && !input.threadId) {
      MessageDispatcher.processMessage(
        input.channelId,
        message.id,
        input.authorDid,
        input.content,
      ).catch((err) => console.error("MessageDispatcher error:", err));
    }

    return message;
  }

  /**
   * Create a threaded message (response to a mention)
   * Returns the new message with threadId set to parentMessageId
   */
  static createThreadReply(input: {
    channelId: string;
    parentMessageId: string;
    authorDid: string;
    authorType: "user" | "agent";
    content: string;
    metadata?: MessageMetadata;
  }): ChannelMessage {
    // Verify parent message exists and is in the channel
    const parentMessage = ChannelMessageDao.getById(input.parentMessageId);
    if (!parentMessage || parentMessage.channelId !== input.channelId) {
      throw new Error("Parent message not found in this channel");
    }

    return ChannelMessageDao.create({
      channelId: input.channelId,
      threadId: input.parentMessageId,
      authorDid: input.authorDid,
      authorType: input.authorType,
      content: input.content,
      metadata: input.metadata ?? {},
    });
  }

  /**
   * Get a message by ID
   */
  static getMessage(messageId: string): ChannelMessage | null {
    return ChannelMessageDao.getById(messageId);
  }

  /**
   * List messages in a channel (top-level only, excludes threads)
   */
  static listMessages(channelId: string, limit?: number, offset?: number): ChannelMessage[] {
    return ChannelMessageDao.listByChannel(channelId, limit, offset);
  }

  /**
   * Get all replies in a thread
   */
  static getThread(parentMessageId: string): ChannelMessage[] {
    return ChannelMessageDao.listThread(parentMessageId);
  }

  /**
   * Edit a message (updates content)
   */
  static editMessage(messageId: string, content: string): ChannelMessage {
    const message = ChannelMessageDao.getById(messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    return ChannelMessageDao.update(messageId, content);
  }

  /**
   * Soft delete a message (sets deletedAt timestamp)
   */
  static deleteMessage(messageId: string): void {
    ChannelMessageDao.softDelete(messageId);
  }

  /**
   * Permanently delete a message
   */
  static hardDeleteMessage(messageId: string): void {
    ChannelMessageDao.hardDelete(messageId);
  }

  /**
   * Add a reaction to a message
   */
  static addReaction(messageId: string, emoji: string, memberDid: string): ChannelMessage {
    return ChannelMessageDao.addReaction(messageId, emoji, memberDid);
  }

  /**
   * Remove a reaction from a message
   */
  static removeReaction(messageId: string, emoji: string, memberDid: string): ChannelMessage {
    return ChannelMessageDao.removeReaction(messageId, emoji, memberDid);
  }

  /**
   * Search messages in a channel
   */
  static searchMessages(channelId: string, query: string, limit?: number): ChannelMessage[] {
    return ChannelMessageDao.searchInChannel(channelId, query, limit);
  }

  /**
   * Get channel statistics
   */
  static getChannelStats(channelId: string): {
    messageCount: number;
    memberCount: number;
  } {
    return {
      messageCount: ChannelMessageDao.getChannelMessageCount(channelId),
      memberCount: ChannelMemberDao.getChannelMemberCount(channelId),
    };
  }

  /**
   * Get all channels a member belongs to
   */
  static getChannelsForMember(memberDid: string): Channel[] {
    const members = ChannelMemberDao.listByMember(memberDid);
    return members
      .map((m) => ChannelDao.getById(m.channelId))
      .filter((c) => c !== null) as Channel[];
  }
}
