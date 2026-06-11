import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

/**
 * VaultysID connection / registration / bastion certificate flows.
 * Some of these exchange raw text/plain certificate bytes rather than JSON.
 */
export const userAuthContract = c.router({
  request: {
    method: "POST",
    path: "/api/user/request/:token",
    pathParams: z.object({ token: z.string() }),
    summary: "Handle a round of the VaultysID Challenger protocol",
    // Raw base64 certificate bytes; the handler reads them via request.text().
    body: c.type<string>(),
    responses: {
      200: c.otherResponse({ contentType: "text/plain", body: c.type<string>() }),
      ...commonErrorResponses,
    },
  },

  p2pConnect: {
    method: "GET",
    path: "/api/user/p2p/connect",
    summary: "Opens a server-side PeerJS channel for user connection",
    responses: {
      200: z.object({
        connectionString: z.string(),
        token: z.string(),
        key: z.string(),
        serverDid: z.string().nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  listen: {
    method: "GET",
    path: "/api/user/listen/:token",
    pathParams: z.object({ token: z.string() }),
    summary: "Poll the status of a connection/registration certificate",
    responses: { 200: z.object({ status: z.number() }), ...commonErrorResponses },
  },

  connect: {
    method: "GET",
    path: "/api/user/connect",
    summary: "Creates a new certificate for the connection flow",
    query: z.object({ register: z.coerce.boolean().optional() }),
    responses: {
      200: z.object({ key: z.string(), token: z.string() }),
      ...commonErrorResponses,
    },
  },

  bastionConnect: {
    method: "GET",
    path: "/api/user/bastion/connect",
    summary: "Initiates the bastion connection flow",
    query: z.object({
      vid: z.string(),
      type: z.enum(["extension", "browser"]).optional(),
    }),
    responses: { 200: z.object({ key: z.string() }), ...commonErrorResponses },
  },

  bastionListen: {
    method: "POST",
    path: "/api/user/bastion/listen/:token",
    pathParams: z.object({ token: z.string() }),
    summary: "Poll bastion connection authentication status",
    body: c.noBody(),
    responses: {
      200: z.object({ status: z.number(), browserDid: z.string().optional() }),
      ...commonErrorResponses,
    },
  },

  bastionAssociate: {
    method: "POST",
    path: "/api/user/bastion/associate",
    summary: "Associate a user certificate with a browser device certificate",
    body: z.object({ userToken: z.string(), browserToken: z.string() }),
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },
});
