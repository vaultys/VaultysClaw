import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  NotImplementedResponseSchema,
  ServerSettingsResponseSchema,
} from "./server.schemas";
import { ServerInfoResponse } from "./server.types";

/**
 * Public server endpoints — read without a session (server identity/settings are
 * needed during onboarding and login, before authentication). The admin server
 * config endpoints live under adminContract.server (/api/admin/server).
 */
export const serverPublicContract = c.router({
  get: {
    method: "GET",
    path: "/api/public/server",
    summary: "Retrieve server identity, status, and system info",
    responses: {
      200: c.type<ServerInfoResponse>(),
      ...commonErrorResponses,
    },
  },

  getSettings: {
    method: "GET",
    path: "/api/public/server/settings",
    summary: "Retrieve server connection settings",
    responses: {
      200: ServerSettingsResponseSchema,
      ...commonErrorResponses,
    },
  },

  entraSendQr: {
    method: "POST",
    path: "/api/public/server/entra/send-qr",
    summary: "Send a QR code to an Entra ID user (not implemented)",
    body: c.type<Record<string, unknown>>(),
    responses: {
      501: NotImplementedResponseSchema,
      ...commonErrorResponses,
    },
  },
});
