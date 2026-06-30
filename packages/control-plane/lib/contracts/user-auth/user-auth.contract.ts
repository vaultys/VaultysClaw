import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  BastionAssociateBodySchema,
  BastionAssociateResponseSchema,
  BastionConnectQuerySchema,
  BastionConnectResponseSchema,
  BastionListenResponseSchema,
  ConnectQuerySchema,
  ConnectResponseSchema,
  ListenResponseSchema,
  P2pConnectResponseSchema,
  UserAuthTokenParamSchema,
} from "./user-auth.schemas";

/**
 * VaultysID connection / registration / bastion certificate flows.
 * Some of these exchange raw text/plain certificate bytes rather than JSON.
 */
export const userAuthContract = c.router({
  request: {
    method: "POST",
    path: "/api/user/request/:token",
    pathParams: UserAuthTokenParamSchema,
    summary: "Handle a round of the VaultysID Challenger protocol",
    // Raw base64 certificate bytes; the handler reads them via request.text().
    body: c.type<string>(),
    responses: {
      200: c.otherResponse({
        contentType: "text/plain",
        body: c.type<string>(),
      }),
      ...commonErrorResponses,
    },
  },

  p2pConnect: {
    method: "GET",
    path: "/api/user/p2p/connect",
    summary: "Opens a server-side PeerJS channel for user connection",
    responses: {
      200: P2pConnectResponseSchema,
      ...commonErrorResponses,
    },
  },

  listen: {
    method: "GET",
    path: "/api/user/listen/:token",
    pathParams: UserAuthTokenParamSchema,
    summary: "Poll the status of a connection/registration certificate",
    responses: { 200: ListenResponseSchema, ...commonErrorResponses },
  },

  connect: {
    method: "GET",
    path: "/api/user/connect",
    summary: "Creates a new certificate for the connection flow",
    query: ConnectQuerySchema,
    responses: {
      200: ConnectResponseSchema,
      ...commonErrorResponses,
    },
  },

  bastionConnect: {
    method: "GET",
    path: "/api/user/bastion/connect",
    summary: "Initiates the bastion connection flow",
    query: BastionConnectQuerySchema,
    responses: { 200: BastionConnectResponseSchema, ...commonErrorResponses },
  },

  bastionListen: {
    method: "POST",
    path: "/api/user/bastion/listen/:token",
    pathParams: UserAuthTokenParamSchema,
    summary: "Poll bastion connection authentication status",
    body: c.noBody(),
    responses: {
      200: BastionListenResponseSchema,
      ...commonErrorResponses,
    },
  },

  bastionAssociate: {
    method: "POST",
    path: "/api/user/bastion/associate",
    summary: "Associate a user certificate with a browser device certificate",
    body: BastionAssociateBodySchema,
    responses: { 200: BastionAssociateResponseSchema, ...commonErrorResponses },
  },
});
