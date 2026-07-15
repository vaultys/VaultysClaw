import { z } from "zod";

// ── Bodies
export const SmtpConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string(),
});

export const EntraConfigSchema = z.object({
  tenantId: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
});

export const SaveServerSettingsBodySchema = z.object({
  walletUrl: z.string().optional(),
  peerjsHost: z.string().optional(),
});

export const EntraSyncBodySchema = z.object({
  groupIds: z.array(z.string()).optional(),
  groupWorkspaceMap: z.record(z.string(), z.string()).optional(),
  groupNames: z.record(z.string(), z.string()).optional(),
});

export const OidcSaveBodySchema = z.object({
  issuer: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  providerName: z.string().optional(),
  keepSecret: z.boolean().optional(),
});

export const OidcTestBodySchema = z.object({ issuer: z.string().optional() });

// ── Responses
export const OkResponseSchema = z.object({ ok: z.boolean() });
