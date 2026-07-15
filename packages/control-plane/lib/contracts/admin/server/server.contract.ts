import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  EntraConfigSchema,
  EntraSyncBodySchema,
  OidcSaveBodySchema,
  OidcTestBodySchema,
  OkResponseSchema,
  SaveServerSettingsBodySchema,
  SmtpConfigSchema,
} from "./server.schemas";
import { EntraUnclaimedResponse } from "./server.types";

/**
 * Admin-only server configuration (SMTP, OIDC, Entra, connection settings). The
 * public read endpoints (server info / settings / entra send-qr) live under
 * publicContract.server (/api/public/server).
 */
export const serverContract = c.router({
  getSmtp: {
    method: "GET",
    path: "/api/admin/server/smtp",
    summary: "Retrieve SMTP configuration with password redacted",
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  saveSmtp: {
    method: "PUT",
    path: "/api/admin/server/smtp",
    summary: "Save SMTP configuration",
    body: SmtpConfigSchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  verifySmtp: {
    method: "POST",
    path: "/api/admin/server/smtp",
    summary: "Verify SMTP connection",
    body: SmtpConfigSchema.partial(),
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  saveSettings: {
    method: "PUT",
    path: "/api/admin/server/settings",
    summary: "Save connection settings",
    body: SaveServerSettingsBodySchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  getEntra: {
    method: "GET",
    path: "/api/admin/server/entra",
    summary: "Retrieve the Entra configuration with secrets redacted",
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  saveEntra: {
    method: "PUT",
    path: "/api/admin/server/entra",
    summary: "Save Entra configuration",
    body: EntraConfigSchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  testEntra: {
    method: "POST",
    path: "/api/admin/server/entra",
    summary: "Test connectivity and list Entra groups",
    body: EntraConfigSchema.partial(),
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  entraUnclaimed: {
    method: "GET",
    path: "/api/admin/server/entra/unclaimed",
    summary: "List unclaimed Entra-provisioned users",
    responses: {
      200: c.type<EntraUnclaimedResponse>(),
      ...commonErrorResponses,
    },
  },

  entraSync: {
    method: "POST",
    path: "/api/admin/server/entra/sync",
    summary: "Trigger a user sync from Microsoft Entra ID",
    body: EntraSyncBodySchema,
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  getOidc: {
    method: "GET",
    path: "/api/admin/server/oidc",
    summary: "Retrieve the OIDC configuration with secrets redacted",
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  saveOidc: {
    method: "PUT",
    path: "/api/admin/server/oidc",
    summary: "Save OIDC configuration",
    body: OidcSaveBodySchema,
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },

  testOidc: {
    method: "POST",
    path: "/api/admin/server/oidc",
    summary: "Test the OIDC connection by validating the issuer's well-known config",
    body: OidcTestBodySchema,
    responses: {
      200: c.type<Record<string, unknown>>(),
      ...commonErrorResponses,
    },
  },

  removeOidc: {
    method: "DELETE",
    path: "/api/admin/server/oidc",
    summary: "Remove the OIDC configuration",
    body: c.noBody(),
    responses: { 200: OkResponseSchema, ...commonErrorResponses },
  },
});
