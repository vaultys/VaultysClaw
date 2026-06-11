/**
 * Channel-based messaging system types for VaultysClaw
 * Supports multi-agent/user collaboration, threading, and external service integration
 */

/**
 * Channel represents a collaboration space for agents and users
 * Can be realm-scoped or global (accessible across all realms)
 */
export interface Channel {
  id: string;
  realmId: string | null; // null = global channel
  name: string;
  slug: string; // unique within realm (or globally if realmId=null)
  description: string | null;
  isPublic: boolean;
  isArchived: boolean;
  topic: string | null; // Optional Slack-style topic
  creatorDid: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export type ChannelInput = Omit<Channel, "id" | "createdAt" | "updatedAt">;

/**
 * Channel member relationship - agents and users can join channels with roles
 */
export interface ChannelMember {
  id: string;
  channelId: string;
  memberDid: string; // User or Agent DID
  memberType: "user" | "agent";
  memberName?: string | null; // Display name resolved server-side (not persisted)
  role: "member" | "moderator" | "owner";
  joinedAt: string; // ISO 8601
  invitedBy: string | null;
}

export type ChannelMemberInput = Omit<
  ChannelMember,
  "id" | "joinedAt" | "memberName"
>;

/**
 * Message attachment metadata
 */
export interface Attachment {
  type: "file" | "link" | "json";
  data: unknown;
}

/**
 * Message metadata - tool calls, mentions, reactions, etc.
 */
export interface MessageMetadata {
  toolCalls?: Record<string, unknown>;
  attachments?: Attachment[];
  mentions?: string[]; // @user mentions
  agentAction?: string; // e.g., "file_upload", "task_created", "offline_notice", "respond_to_mention"
  agentMention?: string; // Name of mentioned agent (set when thread is created from @mention)
}

/**
 * Channel message with threading support
 */
export interface ChannelMessage {
  id: string;
  channelId: string;
  threadId: string | null; // Parent message ID (null = top-level message)
  authorDid: string;
  authorType: "user" | "agent";
  authorName?: string | null; // Display name resolved server-side (not persisted)
  content: string;
  metadata: MessageMetadata;
  reactions: Record<string, string[]>; // { "👍": ["did1", "did2"] }
  editedAt: string | null; // ISO 8601
  deletedAt: string | null; // ISO 8601 (soft delete)
  createdAt: string; // ISO 8601
}

export type ChannelMessageInput = Omit<
  ChannelMessage,
  "id" | "reactions" | "editedAt" | "deletedAt" | "createdAt" | "authorName"
>;

/**
 * External service bridge configuration
 * Syncs messages between VaultysClaw channels and external services (Teams, webhooks, etc.)
 */
export interface ChannelBridge {
  id: string;
  channelId: string;
  externalService: "teams" | "webhook";
  externalChannelId: string;
  externalChannelName: string;
  externalWorkspaceId: string;
  syncDirection: "incoming" | "outgoing" | "bidirectional";
  isSyncEnabled: boolean;
  createdAt: string; // ISO 8601
  configJson: string; // Encrypted: OAuth tokens, webhook URLs, secrets
}

export type ChannelBridgeInput = Omit<ChannelBridge, "id" | "createdAt">;

/**
 * Teams-specific bridge configuration (stored in configJson, encrypted)
 */
export interface TeamsBridgeConfig {
  accessToken: string; // Microsoft Graph API token
  refreshToken?: string;
  expiresAt?: string; // ISO 8601
  tenantId: string; // Azure AD tenant
  botId: string; // Teams app ID
}

/**
 * Webhook-specific bridge configuration (stored in configJson, encrypted)
 */
export interface WebhookBridgeConfig {
  webhookUrl: string; // External service posts to us
  outgoingUrl: string; // We post to this URL
  secret: string; // HMAC signature secret
}

/**
 * WebSocket events for channel updates
 * Published to all channel subscribers in real-time
 */
export type ChannelEvent =
  | {
      type: "message_created";
      channelId: string;
      message: ChannelMessage;
      threadId?: string;
    }
  | {
      type: "message_edited";
      channelId: string;
      messageId: string;
      content: string;
      editedAt: string;
    }
  | {
      type: "message_deleted";
      channelId: string;
      messageId: string;
    }
  | {
      type: "thread_created";
      channelId: string;
      parentMessageId: string;
      threadId: string;
      agentMention: string;
    }
  | {
      type: "member_joined";
      channelId: string;
      member: ChannelMember;
    }
  | {
      type: "member_left";
      channelId: string;
      memberDid: string;
    }
  | {
      type: "typing";
      channelId: string;
      authorDid: string;
      threadId?: string;
    }
  | {
      type: "reaction_added";
      channelId: string;
      messageId: string;
      emoji: string;
      byDid: string;
    }
  | {
      type: "bridge_synced";
      channelId: string;
      bridgeId: string;
      externalMessageId: string;
    };

/**
 * Agent mention context passed to agent when @mentioned in a channel
 */
export interface AgentMentionContext {
  channelId: string;
  channelName: string;
  messageText: string;
  authorDid: string;
  authorType: "user" | "agent";
  threadId: string; // ID of the thread where agent should respond
  realmId: string | null; // null if global channel
  parentMessageContent: string; // Original message that triggered the mention
}
