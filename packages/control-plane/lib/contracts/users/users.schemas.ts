import { z } from "zod";
import { USER_ROLES } from "@/lib/roles";

// ── Path params
export const DidParamSchema = z.object({ did: z.string().min(1) });
export const IdParamSchema = z.object({ id: z.string() });
export const DidGrantParamSchema = z.object({
  did: z.string(),
  id: z.string(),
});
export const TokenParamSchema = z.object({ token: z.string() });

// ── Shared enums / objects
export const RoleEnum = z.enum(USER_ROLES);

export const UserGrantSchema = z.object({
  id: z.string(),
  agentDid: z.string().nullable(),
  capabilities: z.array(z.string()),
  grantedBy: z.string(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

// ── Queries
export const ListUsersQuerySchema = z.object({
  q: z.string().optional(),
  role: RoleEnum.optional(),
  hasAccount: z.enum(["true", "false"]).optional(),
  workspace: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.enum(["name", "email", "registeredAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const SearchUsersQuerySchema = z.object({
  workspace: z.string(),
  q: z.string().optional(),
});

// Optional unclaimed-user id to bind a registration QR to an existing record,
// so scanning it claims that user instead of creating a brand-new one.
export const InviteQuerySchema = z.object({
  userId: z.string().optional(),
});

// ── Bodies
export const UpdateMeBodySchema = z.object({
  name: z.string().max(128).optional(),
  email: z.string().max(256).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

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
