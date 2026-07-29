import { z } from "zod";

// ── Path params ──────────────────────────────────────────────────────────────

export const ProxyDidParamSchema = z.object({ did: z.string() });
export const ProxyUpstreamParamSchema = z.object({
  did: z.string(),
  id: z.string(),
});
export const ProxyRuleParamSchema = z.object({
  did: z.string(),
  id: z.string(),
});
export const ProxyPrincipalParamSchema = z.object({
  did: z.string(),
  id: z.string(),
});

// ── Queries ──────────────────────────────────────────────────────────────────

export const ListProxyLogsQuerySchema = z.object({
  principalDid: z.string().optional(),
  verdict: z.enum(["allow", "deny"]).optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

// ── Bodies ───────────────────────────────────────────────────────────────────

export const UpdateProxyBodySchema = z.object({
  name: z.string().optional(),
  defaultMode: z.enum(["passthrough", "deny"]).optional(),
});

export const CreateUpstreamBodySchema = z.object({
  name: z.string(),
  baseUrl: z.string(),
});

export const UpdateUpstreamBodySchema = z.object({
  name: z.string().optional(),
  baseUrl: z.string().optional(),
});

const ProxyPrincipalIdSourceSchema = z.object({
  from: z.enum(["header", "url", "body"]),
  key: z.string(),
});

export const CreateRuleBodySchema = z.object({
  method: z.string(),
  urlPattern: z.string(),
  mode: z.enum(["no_check", "governed"]),
  governanceRule: z.string().optional(),
  principalIdSource: ProxyPrincipalIdSourceSchema.optional(),
});

export const UpdateRuleBodySchema = z.object({
  method: z.string().optional(),
  urlPattern: z.string().optional(),
  mode: z.enum(["no_check", "governed"]).optional(),
  governanceRule: z.string().nullable().optional(),
  principalIdSource: ProxyPrincipalIdSourceSchema.nullable().optional(),
});

export const UpdatePrincipalBodySchema = z.object({
  tag: z.string().nullable().optional(),
  governanceRules: z.array(z.string()).optional(),
  status: z.enum(["pending", "active", "revoked"]).optional(),
});
