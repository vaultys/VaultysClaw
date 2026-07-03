import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  EntraConfigSchema,
  EntraSyncBodySchema,
  NotImplementedResponseSchema,
  OidcSaveBodySchema,
  OidcTestBodySchema,
  OkResponseSchema,
  SaveServerSettingsBodySchema,
  ServerSettingsResponseSchema,
  SmtpConfigSchema,
} from "./server.schemas";
import { EntraUnclaimedResponse, ServerInfoResponse } from "./server.types";

export const serverContract = c.router({
  get: {
    method: "GET",
    path: "/api/server",
    summary: "Retrieve server identity, status, and system info",
    responses: {
      200: c.type<ServerInfoResponse>(),
      ...commonErrorResponses,
    },
  },

  getSmtp: {
    method: "GET",
    path: "/api/server/smtp",
    summary: "Retrieve SMTP configuration with password redacted",
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  saveSmtp: {
    method: "PUT",
    path: "/api/server/smtp",
    summary: "Save SMTP configuration",
    body: SmtpConfigSchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  verifySmtp: {
    method: "POST",
    path: "/api/server/smtp",
    summary: "Verify SMTP connection",
    body: SmtpConfigSchema.partial(),
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  getSettings: {
    method: "GET",
    path: "/api/server/settings",
    summary: "Retrieve server connection settings",
    responses: {
      200: ServerSettingsResponseSchema,
      ...commonErrorResponses,
    },
  },

  saveSettings: {
    method: "PUT",
    path: "/api/server/settings",
    summary: "Save connection settings",
    body: SaveServerSettingsBodySchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  getEntra: {
    method: "GET",
    path: "/api/server/entra",
    summary: "Retrieve the Entra configuration with secrets redacted",
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  saveEntra: {
    method: "PUT",
    path: "/api/server/entra",
    summary: "Save Entra configuration",
    body: EntraConfigSchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  testEntra: {
    method: "POST",
    path: "/api/server/entra",
    summary: "Test connectivity and list Entra groups",
    body: EntraConfigSchema.partial(),
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  entraUnclaimed: {
    method: "GET",
    path: "/api/server/entra/unclaimed",
    summary: "List unclaimed Entra-provisioned users",
    responses: {
      200: c.type<EntraUnclaimedResponse>(),
      ...commonErrorResponses,
    },
  },

  entraSync: {
    method: "POST",
    path: "/api/server/entra/sync",
    summary: "Trigger a user sync from Microsoft Entra ID",
    body: EntraSyncBodySchema,
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  entraSendQr: {
    method: "POST",
    path: "/api/server/entra/send-qr",
    summary: "Send a QR code to an Entra ID user (not implemented)",
    body: c.type<Record<string, unknown>>(),
    responses: {
      501: NotImplementedResponseSchema,
      ...commonErrorResponses,
    },
  },

  getOidc: {
    method: "GET",
    path: "/api/server/oidc",
    summary: "Retrieve the OIDC configuration with secrets redacted",
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  saveOidc: {
    method: "PUT",
    path: "/api/server/oidc",
    summary: "Save OIDC configuration",
    body: OidcSaveBodySchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  testOidc: {
    method: "POST",
    path: "/api/server/oidc",
    summary: "Test the OIDC connection by validating the issuer's well-known config",
    body: OidcTestBodySchema,
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  removeOidc: {
    method: "DELETE",
    path: "/api/server/oidc",
    summary: "Remove the OIDC configuration",
    body: c.noBody(),
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },
});
