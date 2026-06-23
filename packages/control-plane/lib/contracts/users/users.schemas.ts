import { z } from "zod";

// ── Path params
export const DidParamSchema = z.object({ did: z.string().min(1) });
export const IdParamSchema = z.object({ id: z.string() });
export const DidGrantParamSchema = z.object({
  did: z.string(),
  id: z.string(),
});
export const TokenParamSchema = z.object({ token: z.string() });

// ── Shared enums / objects
export const RoleEnum = z.enum([
  "owner",
  "admin",
  "manager",
  "operator",
  "member",
]);

export const UserGrantSchema = z.object({
  id: z.string(),
  agentDid: z.string(),
  capabilities: z.array(z.string()),
  grantedBy: z.string(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

// ── Queries
export const ListUsersQuerySchema = z.object({
  q: z.string().optional(),
  role: RoleEnum.optional(),
  isAdmin: z.enum(["true", "false"]).optional(),
  hasAccount: z.enum(["true", "false"]).optional(),
  realm: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.enum(["name", "email", "registeredAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const SearchUsersQuerySchema = z.object({
  realm: z.string(),
  q: z.string().optional(),
});

// ── Bodies
export const UpdateMeBodySchema = z.object({ name: z.string().max(128) });

export const InviteEmailBodySchema = z.object({
  email: z.string().email(),
  name: z.string(),
  role: z.string().optional(),
  skipEmail: z.boolean().optional(),
});

export const InviteFromEmailBodySchema = z.object({ token: z.string() });

export const UpdateUserBodySchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  role: RoleEnum.optional(),
  reportsTo: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const SendUnclaimedQrBodySchema = z.object({
  sendByEmail: z.boolean().optional(),
});

export const SetUserLocationBodySchema = z.object({
  lat: z.number().nullable().optional(),
  lon: z.number().optional(),
  label: z.string().optional(),
});

export const CreateGrantBodySchema = z.object({
  agentDid: z.string().nullable().optional(),
  capabilities: z.array(z.string()),
  expiresAt: z.string().optional(),
});

export const SetAdminBodySchema = z.object({ isAdmin: z.boolean() });
