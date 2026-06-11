import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { Channel, ChannelBridge, ChannelMember, ChannelMessage } from "@prisma/client";

const IdParam = z.object({ id: z.string().min(1) });

const MessageMetadata = z
  .object({
    toolCalls: z.record(z.string(), z.unknown()).optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    mentions: z.array(z.string()).optional(),
    agentAction: z.string().optional(),
  })
  .optional();

export const channelsContract = c.router({
  list: {
    method: "GET",
    path: "/api/channels",
    summary: "List channels in a realm, optionally including global channels",
    query: z.object({
      realm: z.string(),
      includeGlobal: z.coerce.boolean().optional(),
    }),
    responses: { 200: c.type<{ channels: Channel[] }>(), ...commonErrorResponses },
  },

  create: {
    method: "POST",
    path: "/api/channels",
    summary: "Create a new channel",
    body: z.object({
      name: z.string(),
      slug: z.string().optional(),
      realmId: z.string().optional(),
      description: z.string().optional(),
      isPublic: z.boolean().optional(),
      topic: z.string().optional(),
    }),
    responses: { 201: c.type<{ channel: Channel }>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/channels/:id",
    pathParams: IdParam,
    summary: "Get channel details including members",
    responses: {
      200: c.type<{
        channel: Channel;
        members: ChannelMember[];
        stats: Record<string, unknown>;
      }>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/channels/:id",
    pathParams: IdParam,
    summary: "Update channel metadata",
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      topic: z.string().optional(),
      isPublic: z.boolean().optional(),
    }),
    responses: { 200: c.type<{ channel: Channel }>(), ...commonErrorResponses },
  },

  archive: {
    method: "DELETE",
    path: "/api/channels/:id",
    pathParams: IdParam,
    summary: "Archive a channel (soft delete)",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  listMessages: {
    method: "GET",
    path: "/api/channels/:id/messages",
    pathParams: IdParam,
    summary: "List messages in a channel or thread",
    query: z.object({
      limit: z.coerce.number().optional(),
      before: z.string().optional(),
      threadId: z.string().optional(),
    }),
    responses: { 200: c.type<{ messages: ChannelMessage[] }>(), ...commonErrorResponses },
  },

  postMessage: {
    method: "POST",
    path: "/api/channels/:id/messages",
    pathParams: IdParam,
    summary: "Post a message to a channel",
    body: z.object({
      content: z.string(),
      threadId: z.string().optional(),
      metadata: MessageMetadata,
    }),
    responses: { 201: c.type<{ message: ChannelMessage }>(), ...commonErrorResponses },
  },

  postAgentResponse: {
    method: "POST",
    path: "/api/channels/:id/messages/agent-response",
    pathParams: IdParam,
    summary: "Post an agent response to a channel or thread",
    body: z.object({
      content: z.string(),
      threadId: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: { 201: c.type<{ message: ChannelMessage }>(), ...commonErrorResponses },
  },

  getMessage: {
    method: "GET",
    path: "/api/channels/:id/messages/:msgId",
    pathParams: z.object({ id: z.string(), msgId: z.string() }),
    summary: "Get a specific message",
    responses: { 200: c.type<{ message: ChannelMessage }>(), ...commonErrorResponses },
  },

  editMessage: {
    method: "PATCH",
    path: "/api/channels/:id/messages/:msgId",
    pathParams: z.object({ id: z.string(), msgId: z.string() }),
    summary: "Edit a specific message in a channel",
    body: z.object({ content: z.string() }),
    responses: { 200: c.type<{ message: ChannelMessage }>(), ...commonErrorResponses },
  },

  deleteMessage: {
    method: "DELETE",
    path: "/api/channels/:id/messages/:msgId",
    pathParams: z.object({ id: z.string(), msgId: z.string() }),
    summary: "Soft delete a message in a channel",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  react: {
    method: "POST",
    path: "/api/channels/:id/messages/:msgId/reactions",
    pathParams: z.object({ id: z.string(), msgId: z.string() }),
    summary: "Add or remove a reaction to a message",
    body: z.object({ emoji: z.string(), add: z.boolean() }),
    responses: { 200: c.type<{ message: string }>(), ...commonErrorResponses },
  },

  listThread: {
    method: "GET",
    path: "/api/channels/:id/threads",
    pathParams: IdParam,
    summary: "Get all replies in a thread",
    query: z.object({ parentMessageId: z.string() }),
    responses: { 200: c.type<{ messages: ChannelMessage[] }>(), ...commonErrorResponses },
  },

  createThreadReply: {
    method: "POST",
    path: "/api/channels/:id/threads",
    pathParams: IdParam,
    summary: "Create a threaded reply to a message",
    body: z.object({
      parentMessageId: z.string(),
      content: z.string(),
      metadata: MessageMetadata,
    }),
    responses: { 201: c.type<void>(), ...commonErrorResponses },
  },

  addMember: {
    method: "POST",
    path: "/api/channels/:id/members",
    pathParams: IdParam,
    summary: "Add a member to a channel",
    body: z.object({
      memberDid: z.string(),
      memberType: z.enum(["user", "agent"]),
      role: z.enum(["member", "moderator", "owner"]).optional(),
      invitedBy: z.string().optional(),
    }),
    responses: { 201: c.type<void>(), ...commonErrorResponses },
  },

  removeMember: {
    method: "DELETE",
    path: "/api/channels/:id/members/:memberDid",
    pathParams: z.object({ id: z.string(), memberDid: z.string() }),
    summary: "Remove a member from a channel",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  listBridges: {
    method: "GET",
    path: "/api/channels/:id/bridges",
    pathParams: IdParam,
    summary: "List all bridges for a channel",
    responses: { 200: c.type<{ bridges: ChannelBridge[] }>(), ...commonErrorResponses },
  },

  createBridge: {
    method: "POST",
    path: "/api/channels/:id/bridges",
    pathParams: IdParam,
    summary: "Create a new bridge for the channel",
    body: z.object({
      externalService: z.enum(["teams", "webhook"]),
      externalChannelId: z.string().optional(),
      externalChannelName: z.string().optional(),
      externalWorkspaceId: z.string().optional(),
      syncDirection: z.enum(["incoming", "outgoing", "bidirectional"]).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: {
      201: c.type<{ bridge: Record<string, unknown> }>(),
      ...commonErrorResponses,
    },
  },

  updateBridge: {
    method: "PATCH",
    path: "/api/channels/:id/bridges/:bridgeId",
    pathParams: z.object({ id: z.string(), bridgeId: z.string() }),
    summary: "Update syncDirection and/or isSyncEnabled for a bridge",
    body: z.object({
      syncDirection: z.enum(["incoming", "outgoing", "bidirectional"]).optional(),
      isSyncEnabled: z.boolean().optional(),
    }),
    responses: { 200: c.type<{ bridge: ChannelBridge }>(), ...commonErrorResponses },
  },

  deleteBridge: {
    method: "DELETE",
    path: "/api/channels/:id/bridges/:bridgeId",
    pathParams: z.object({ id: z.string(), bridgeId: z.string() }),
    summary: "Delete a bridge",
    responses: { 200: z.object({ success: z.boolean() }), ...commonErrorResponses },
  },
});

export const bridgesContract = c.router({
  webhookIncoming: {
    method: "POST",
    path: "/api/bridges/webhook/:bridgeId/incoming",
    pathParams: z.object({ bridgeId: z.string() }),
    summary: "Accepts inbound messages from external webhook sources",
    body: z.object({
      message: z.string().optional(),
      author: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: {
      200: z.object({ ok: z.boolean(), messageId: z.string() }),
      ...commonErrorResponses,
    },
  },

  teamsIncoming: {
    method: "POST",
    path: "/api/bridges/teams/incoming",
    summary: "Process incoming messages from Teams Bot Framework",
    body: z.record(z.string(), z.unknown()),
    responses: {
      200: z.object({ ok: z.boolean(), messageId: z.string() }),
      ...commonErrorResponses,
    },
  },
});
