import { z } from "zod";

// ── Path params
export const ChannelIdParamSchema = z.object({ id: z.string().min(1) });
export const MessageParamsSchema = z.object({
  id: z.string(),
  msgId: z.string(),
});
export const MemberParamsSchema = z.object({
  id: z.string(),
  memberDid: z.string(),
});
export const BridgeParamsSchema = z.object({
  id: z.string(),
  bridgeId: z.string(),
});
export const BridgeIncomingParamsSchema = z.object({ bridgeId: z.string() });

// ── Queries
export const ListChannelsQuerySchema = z.object({
  workspace: z.string(),
  includeGlobal: z.coerce.boolean().optional(),
});
export const ListMessagesQuerySchema = z.object({
  limit: z.coerce.number().optional(),
  before: z.string().optional(),
  threadId: z.string().optional(),
});
export const ListThreadQuerySchema = z.object({ parentMessageId: z.string() });

// ── Shared body fragments
export const MessageMetadataSchema = z
  .object({
    toolCalls: z.record(z.string(), z.unknown()).optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    mentions: z.array(z.string()).optional(),
    agentAction: z.string().optional(),
  })
  .optional();

// ── Bodies
export const CreateChannelBodySchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  workspaceId: z.string().optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
  topic: z.string().optional(),
});
export const UpdateChannelBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  topic: z.string().optional(),
  isPublic: z.boolean().optional(),
});
export const PostMessageBodySchema = z.object({
  content: z.string(),
  threadId: z.string().optional(),
  metadata: MessageMetadataSchema,
});
export const PostAgentResponseBodySchema = z.object({
  content: z.string(),
  threadId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const EditMessageBodySchema = z.object({ content: z.string() });
export const ReactBodySchema = z.object({
  emoji: z.string(),
  add: z.boolean(),
});
export const CreateThreadReplyBodySchema = z.object({
  parentMessageId: z.string(),
  content: z.string(),
  metadata: MessageMetadataSchema,
});
export const AddMemberBodySchema = z.object({
  memberDid: z.string(),
  memberType: z.enum(["user", "agent"]),
  role: z.enum(["member", "moderator", "owner"]).optional(),
  invitedBy: z.string().optional(),
});
export const CreateBridgeBodySchema = z.object({
  externalService: z.enum(["teams", "webhook"]),
  externalChannelId: z.string().optional(),
  externalChannelName: z.string().optional(),
  externalWorkspaceId: z.string().optional(),
  syncDirection: z.enum(["incoming", "outgoing", "bidirectional"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export const UpdateBridgeBodySchema = z.object({
  syncDirection: z.enum(["incoming", "outgoing", "bidirectional"]).optional(),
  isSyncEnabled: z.boolean().optional(),
});
export const WebhookIncomingBodySchema = z.object({
  message: z.string().optional(),
  author: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const TeamsIncomingBodySchema = z.record(z.string(), z.unknown());

// ── Responses
export const SuccessResponseSchema = z.object({ success: z.boolean() });
export const BridgeIncomingResponseSchema = z.object({
  ok: z.boolean(),
  messageId: z.string(),
});
