import { z } from "zod";
import type { User } from "@prisma/client";
import {
  UserGrantSchema,
  ListUsersQuerySchema,
  UpdateUserBodySchema,
  InviteEmailBodySchema,
  CreateGrantBodySchema,
} from "./users.schemas";

// Prisma User row is the single source of truth for persisted user fields.
export type { User };

export type UserGrant = z.infer<typeof UserGrantSchema>;

/**
 * The current user's own profile, as returned by `GET /api/users/me`. Reuses
 * the Prisma `User` row for stable fields; `isAdmin` is computed (stored
 * `isAdmin` OR `isOwner`) and the date fields are serialized to ISO strings.
 */
export type MeProfile = Pick<
  User,
  | "id"
  | "did"
  | "publicKey"
  | "name"
  | "email"
  | "description"
  | "role"
  | "isOwner"
  | "entraId"
  | "locationLabel"
> & {
  isAdmin: boolean;
  registeredAt: string;
  claimedAt: string | null;
};

/** A realm membership of the current user, as returned by `GET /api/users/me/realms`. */
export interface MeRealmMembership {
  realmId: string;
  realmName: string;
  realmSlug: string;
  realmColor: string | null;
  isDefault: boolean;
  isPrimary: boolean;
  isRealmAdmin: boolean;
  joinedAt: string;
}

/** Response of `PATCH /api/users/me` — the updated editable fields. */
export interface UpdateMeResponse {
  ok: boolean;
  name: string | null;
  email: string | null;
  description: string | null;
}

/** A realm membership summary attached to a user in list/detail responses. */
export interface UserRealmSummary {
  id: string;
  name: string;
  slug: string;
  color: string;
  isPrimary: boolean;
}

/** A user row as returned by `GET /api/users` — Prisma fields plus realm memberships. */
export type UserListItem = Pick<
  User,
  "id" | "did" | "name" | "email" | "isOwner" | "isAdmin" | "role" | "entraId"
> & {
  claimedAt: string | null;
  registeredAt: string;
  realms: UserRealmSummary[];
};

export interface UserListResponse {
  users: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** A single user as returned by `GET /api/users/:did`. */
export type UserDetail = Pick<
  User,
  | "did"
  | "name"
  | "email"
  | "isOwner"
  | "isAdmin"
  | "role"
  | "reportsTo"
  | "description"
  | "locationLat"
  | "locationLon"
  | "locationLabel"
> & { registeredAt: string };

/** A user's membership in a single realm, as returned by `GET /api/users/:did/realms`. */
export interface UserRealmMembership {
  realmId: string;
  realmName: string;
  realmSlug: string;
  realmColor: string;
  isDefault: boolean;
  isPrimary: boolean;
  isRealmAdmin: boolean;
  joinedAt: string;
}

export interface UserRealmsResponse {
  memberships: UserRealmMembership[];
  available: Array<{ id: string; name: string; slug: string; color: string }>;
}

/** An unclaimed (Entra-provisioned, no DID yet) user as returned by `GET /api/users/unclaimed/:id`. */
export type UnclaimedUserDetail = Pick<
  User,
  | "id"
  | "did"
  | "name"
  | "email"
  | "isOwner"
  | "isAdmin"
  | "role"
  | "reportsTo"
  | "description"
  | "entraId"
> & {
  registeredAt: string;
  claimedAt: string | null;
  realms: UserRealmSummary[];
};

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;
export type InviteEmailBody = z.infer<typeof InviteEmailBodySchema>;
export type CreateGrantBody = z.infer<typeof CreateGrantBodySchema>;
