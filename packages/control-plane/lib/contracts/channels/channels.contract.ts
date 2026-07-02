import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  AddMemberBodySchema,
  BridgeIncomingParamsSchema,
  BridgeIncomingResponseSchema,
  BridgeParamsSchema,
  ChannelIdParamSchema,
  CreateBridgeBodySchema,
  CreateChannelBodySchema,
  CreateThreadReplyBodySchema,
  EditMessageBodySchema,
  ListChannelsQuerySchema,
  ListMessagesQuerySchema,
  ListThreadQuerySchema,
  MemberParamsSchema,
  MessageParamsSchema,
  PostAgentResponseBodySchema,
  PostMessageBodySchema,
  ReactBodySchema,
  SuccessResponseSchema,
  UpdateBridgeBodySchema,
  UpdateChannelBodySchema,
} from "./channels.schemas";
import type {
  Channel,
  ChannelBridgePublic,
  ChannelDetailResponse,
  ChannelMember,
  ChannelMessage,
} from "./channels.types";

export const channelsContract = c.router({
  list: {
    method: "GET",
    path: "/api/channels",
    summary: "List channels in a workspace, optionally including global channels",
    query: ListChannelsQuerySchema,
    responses: {
      200: c.type<{ channels: Channel[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/channels",
    summary: "Create a new channel",
    body: CreateChannelBodySchema,
    responses: { 201: c.type<{ channel: Channel }>(), ...commonErrorResponses },
  },

  getOne: {
    method: "GET",
    path: "/api/channels/:id",
    pathParams: ChannelIdParamSchema,
    summary: "Get channel details including members",
    responses: {
      200: c.type<ChannelDetailResponse>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/channels/:id",
    pathParams: ChannelIdParamSchema,
    summary: "Update channel metadata",
    body: UpdateChannelBodySchema,
    responses: { 200: c.type<{ channel: Channel }>(), ...commonErrorResponses },
  },

  archive: {
    method: "DELETE",
    path: "/api/channels/:id",
    pathParams: ChannelIdParamSchema,
    summary: "Archive a channel (soft delete)",
    responses: { 200: SuccessResponseSchema, ...commonErrorResponses },
  },

  listMessages: {
    method: "GET",
    path: "/api/channels/:id/messages",
    pathParams: ChannelIdParamSchema,
    summary: "List messages in a channel or thread",
    query: ListMessagesQuerySchema,
    responses: {
      200: c.type<{ messages: ChannelMessage[] }>(),
      ...commonErrorResponses,
    },
  },

  postMessage: {
    method: "POST",
    path: "/api/channels/:id/messages",
    pathParams: ChannelIdParamSchema,
    summary: "Post a message to a channel",
    body: PostMessageBodySchema,
    responses: {
      201: c.type<{ message: ChannelMessage }>(),
      ...commonErrorResponses,
    },
  },

  postAgentResponse: {
    method: "POST",
    path: "/api/channels/:id/messages/agent-response",
    pathParams: ChannelIdParamSchema,
    summary: "Post an agent response to a channel or thread",
    body: PostAgentResponseBodySchema,
    responses: {
      201: c.type<{ message: ChannelMessage }>(),
      ...commonErrorResponses,
    },
  },

  getMessage: {
    method: "GET",
    path: "/api/channels/:id/messages/:msgId",
    pathParams: MessageParamsSchema,
    summary: "Get a specific message",
    responses: {
      200: c.type<{ message: ChannelMessage }>(),
      ...commonErrorResponses,
    },
  },

  editMessage: {
    method: "PATCH",
    path: "/api/channels/:id/messages/:msgId",
    pathParams: MessageParamsSchema,
    summary: "Edit a specific message in a channel",
    body: EditMessageBodySchema,
    responses: {
      200: c.type<{ message: ChannelMessage }>(),
      ...commonErrorResponses,
    },
  },

  deleteMessage: {
    method: "DELETE",
    path: "/api/channels/:id/messages/:msgId",
    pathParams: MessageParamsSchema,
    summary: "Soft delete a message in a channel",
    responses: { 200: SuccessResponseSchema, ...commonErrorResponses },
  },

  react: {
    method: "POST",
    path: "/api/channels/:id/messages/:msgId/reactions",
    pathParams: MessageParamsSchema,
    summary: "Add or remove a reaction to a message",
    body: ReactBodySchema,
    responses: {
      200: c.type<{ message: ChannelMessage }>(),
      ...commonErrorResponses,
    },
  },

  listThread: {
    method: "GET",
    path: "/api/channels/:id/threads",
    pathParams: ChannelIdParamSchema,
    summary: "Get all replies in a thread",
    query: ListThreadQuerySchema,
    responses: {
      200: c.type<{ messages: ChannelMessage[] }>(),
      ...commonErrorResponses,
    },
  },

  createThreadReply: {
    method: "POST",
    path: "/api/channels/:id/threads",
    pathParams: ChannelIdParamSchema,
    summary: "Create a threaded reply to a message",
    body: CreateThreadReplyBodySchema,
    responses: {
      201: c.type<{ message: ChannelMessage }>(),
      ...commonErrorResponses,
    },
  },

  addMember: {
    method: "POST",
    path: "/api/channels/:id/members",
    pathParams: ChannelIdParamSchema,
    summary: "Add a member to a channel",
    body: AddMemberBodySchema,
    responses: {
      201: c.type<{ member: ChannelMember }>(),
      ...commonErrorResponses,
    },
  },

  removeMember: {
    method: "DELETE",
    path: "/api/channels/:id/members/:memberDid",
    pathParams: MemberParamsSchema,
    summary: "Remove a member from a channel",
    responses: { 200: SuccessResponseSchema, ...commonErrorResponses },
  },

  listBridges: {
    method: "GET",
    path: "/api/channels/:id/bridges",
    pathParams: ChannelIdParamSchema,
    summary: "List all bridges for a channel",
    responses: {
      200: c.type<{ bridges: ChannelBridgePublic[] }>(),
      ...commonErrorResponses,
    },
  },

  createBridge: {
    method: "POST",
    path: "/api/channels/:id/bridges",
    pathParams: ChannelIdParamSchema,
    summary: "Create a new bridge for the channel",
    body: CreateBridgeBodySchema,
    responses: {
      201: c.type<{ bridge: ChannelBridgePublic }>(),
      ...commonErrorResponses,
    },
  },

  updateBridge: {
    method: "PATCH",
    path: "/api/channels/:id/bridges/:bridgeId",
    pathParams: BridgeParamsSchema,
    summary: "Update syncDirection and/or isSyncEnabled for a bridge",
    body: UpdateBridgeBodySchema,
    responses: {
      200: c.type<{ bridge: ChannelBridgePublic }>(),
      ...commonErrorResponses,
    },
  },

  deleteBridge: {
    method: "DELETE",
    path: "/api/channels/:id/bridges/:bridgeId",
    pathParams: BridgeParamsSchema,
    summary: "Delete a bridge",
    responses: { 200: SuccessResponseSchema, ...commonErrorResponses },
  },
});

export const bridgesContract = c.router({
  webhookIncoming: {
    method: "POST",
    path: "/api/bridges/webhook/:bridgeId/incoming",
    pathParams: BridgeIncomingParamsSchema,
    summary: "Accepts inbound messages from external webhook sources",
    // The handler reads the raw request body (request.text()) to verify the
    // HMAC signature over the exact bytes, so the body is declared as an opaque
    // type — a Zod body would make createNextRoute consume the stream as JSON.
    body: c.type<unknown>(),
    responses: {
      200: BridgeIncomingResponseSchema,
      ...commonErrorResponses,
    },
  },

  teamsIncoming: {
    method: "POST",
    path: "/api/bridges/teams/incoming",
    summary: "Process incoming messages from Teams Bot Framework",
    // Raw body needed for Bot Framework auth verification — see above.
    body: c.type<unknown>(),
    responses: {
      200: BridgeIncomingResponseSchema,
      ...commonErrorResponses,
    },
  },
});
