import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

const SmtpConfig = z.object({
  host: z.string(),
  port: z.number(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string(),
});

const EntraConfig = z.object({
  tenantId: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
});

export const serverContract = c.router({
  get: {
    method: "GET",
    path: "/api/server",
    summary: "Retrieve server identity, status, and system info",
    responses: {
      200: c.type<{
        identity: Record<string, unknown> | null;
        stats: { totalAgents: number; onlineAgents: number; offlineAgents: number };
        sysInfo: Record<string, unknown>;
        walletUrl: string;
      }>(),
      ...commonErrorResponses,
    },
  },

  getSmtp: {
    method: "GET",
    path: "/api/server/smtp",
    summary: "Retrieve SMTP configuration with password redacted",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  saveSmtp: {
    method: "PUT",
    path: "/api/server/smtp",
    summary: "Save SMTP configuration",
    body: SmtpConfig,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  verifySmtp: {
    method: "POST",
    path: "/api/server/smtp",
    summary: "Verify SMTP connection",
    body: SmtpConfig.partial(),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  getSettings: {
    method: "GET",
    path: "/api/server/settings",
    summary: "Retrieve server connection settings",
    responses: {
      200: z.object({ walletUrl: z.string(), peerjsHost: z.string() }),
      ...commonErrorResponses,
    },
  },

  saveSettings: {
    method: "PUT",
    path: "/api/server/settings",
    summary: "Save connection settings",
    body: z.object({
      walletUrl: z.string().optional(),
      peerjsHost: z.string().optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  getEntra: {
    method: "GET",
    path: "/api/server/entra",
    summary: "Retrieve the Entra configuration with secrets redacted",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  saveEntra: {
    method: "PUT",
    path: "/api/server/entra",
    summary: "Save Entra configuration",
    body: EntraConfig,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  testEntra: {
    method: "POST",
    path: "/api/server/entra",
    summary: "Test connectivity and list Entra groups",
    body: EntraConfig.partial(),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  entraUnclaimed: {
    method: "GET",
    path: "/api/server/entra/unclaimed",
    summary: "List unclaimed Entra-provisioned users",
    responses: {
      200: c.type<{ users: Array<Record<string, unknown>> }>(),
      ...commonErrorResponses,
    },
  },

  entraSync: {
    method: "POST",
    path: "/api/server/entra/sync",
    summary: "Trigger a user sync from Microsoft Entra ID",
    body: z.object({
      groupIds: z.array(z.string()).optional(),
      groupRealmMap: z.record(z.string(), z.string()).optional(),
    }),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },
});
