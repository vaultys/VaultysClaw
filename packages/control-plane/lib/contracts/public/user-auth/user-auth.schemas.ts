import { z } from "zod";

// ── Path params
export const UserAuthTokenParamSchema = z.object({ token: z.string() });

// ── Queries
export const ConnectQuerySchema = z.object({
  register: z.coerce.boolean().optional(),
});

export const BastionConnectQuerySchema = z.object({
  vid: z.string(),
  type: z.enum(["extension", "browser"]).optional(),
});

// ── Bodies
export const BastionAssociateBodySchema = z.object({
  userToken: z.string(),
  browserToken: z.string(),
});

// ── Responses
export const P2pConnectResponseSchema = z.object({
  connectionString: z.string(),
  token: z.string(),
  key: z.string(),
  serverDid: z.string().nullable(),
});

export const ListenResponseSchema = z.object({ status: z.number() });

export const ConnectResponseSchema = z.object({
  key: z.string(),
  token: z.string(),
});

export const BastionConnectResponseSchema = z.object({ key: z.string() });

export const BastionListenResponseSchema = z.object({
  status: z.number(),
  browserDid: z.string().optional(),
});

export const BastionAssociateResponseSchema = z.object({ ok: z.boolean() });
