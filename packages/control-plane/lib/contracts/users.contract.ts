import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { User } from "@prisma/client";

const DidParam = z.object({ did: z.string().min(1) });
const RoleEnum = z.enum(["owner", "admin", "manager", "operator", "member"]);

const UserGrantSchema = z.object({
  id: z.string(),
  agentDid: z.string(),
  capabilities: z.array(z.string()),
  grantedBy: z.string(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const usersContract = c.router({
  list: {
    method: "GET",
    path: "/api/users",
    summary: "List registered users with optional pagination and filters",
    query: z.object({
      q: z.string().optional(),
      role: RoleEnum.optional(),
      isAdmin: z.enum(["true", "false"]).optional(),
      realm: z.string().optional(),
      page: z.coerce.number().optional(),
      pageSize: z.coerce.number().optional(),
      sortBy: z.enum(["name", "email", "registeredAt"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }),
    responses: {
      200: c.type<{
        users: User[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(),
      ...commonErrorResponses,
    },
  },

  me: {
    method: "GET",
    path: "/api/users/me",
    summary: "Return the current user's profile",
    responses: {
      200: z.object({
        did: z.string(),
        name: z.string().nullable(),
        isOwner: z.boolean(),
        isAdmin: z.boolean(),
      }),
      ...commonErrorResponses,
    },
  },

  updateMe: {
    method: "PATCH",
    path: "/api/users/me",
    summary: "Update the current user's own name",
    body: z.object({ name: z.string().max(128) }),
    responses: {
      200: z.object({ ok: z.boolean(), name: z.string().nullable() }),
      ...commonErrorResponses,
    },
  },

  search: {
    method: "GET",
    path: "/api/users/search",
    summary: "List users in a realm with optional search by name/email",
    query: z.object({ realm: z.string(), q: z.string().optional() }),
    responses: {
      200: c.type<{
        users: Array<{ id: string; name: string; email: string; joinedAt: string }>;
      }>(),
      ...commonErrorResponses,
    },
  },

  invite: {
    method: "GET",
    path: "/api/users/invite",
    summary: "Create a registration certificate for a new user",
    responses: {
      200: z.object({
        connectionString: z.string(),
        token: z.string(),
        key: z.string(),
        serverDid: z.string(),
      }),
      ...commonErrorResponses,
    },
  },

  inviteFromEmail: {
    method: "POST",
    path: "/api/users/invite/from-email",
    summary: "Generate QR code from an email invitation token",
    body: z.object({ token: z.string() }),
    responses: {
      200: z.object({
        qrUrl: z.string(),
        connectionString: z.string(),
        inviteToken: z.string(),
        serverDid: z.string(),
      }),
      ...commonErrorResponses,
    },
  },

  inviteEmail: {
    method: "POST",
    path: "/api/users/invite/email",
    summary: "Send an email invitation to a new user",
    body: z.object({
      email: z.string().email(),
      name: z.string(),
      role: z.string().optional(),
    }),
    responses: {
      200: z.object({ token: z.string(), userId: z.string() }),
      ...commonErrorResponses,
    },
  },

  getUnclaimed: {
    method: "GET",
    path: "/api/users/unclaimed/:id",
    pathParams: z.object({ id: z.string() }),
    summary: "Get an unclaimed Entra user by internal ID",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  updateUnclaimed: {
    method: "PATCH",
    path: "/api/users/unclaimed/:id",
    pathParams: z.object({ id: z.string() }),
    summary: "Update profile fields of an unclaimed user",
    body: z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      role: RoleEnum.optional(),
      reportsTo: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  removeUnclaimed: {
    method: "DELETE",
    path: "/api/users/unclaimed/:id",
    pathParams: z.object({ id: z.string() }),
    summary: "Remove an unclaimed user by internal ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  sendUnclaimedQr: {
    method: "POST",
    path: "/api/users/unclaimed/:id/send-qr",
    pathParams: z.object({ id: z.string() }),
    summary: "Send a QR code to an unclaimed user via email",
    body: z.object({ sendByEmail: z.boolean().optional() }),
    responses: {
      200: z.object({
        qrUrl: z.string(),
        token: z.string(),
        key: z.string(),
        serverDid: z.string(),
        emailSent: z.boolean(),
      }),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/users/:did",
    pathParams: DidParam,
    summary: "Get a single user by DID",
    responses: {
      200: c.type<
        Pick<
          User,
          "did" | "name" | "email" | "isOwner" | "isAdmin" | "role" | "reportsTo" | "description"
        > & { registeredAt: string; grants: Array<z.infer<typeof UserGrantSchema>> }
      >(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/users/:did",
    pathParams: DidParam,
    summary: "Update a user's profile fields",
    body: z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      role: RoleEnum.optional(),
      reportsTo: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/users/:did",
    pathParams: DidParam,
    summary: "Remove a user and all their grants (owner-only)",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  realms: {
    method: "GET",
    path: "/api/users/:did/realms",
    pathParams: DidParam,
    summary: "List realms the user belongs to and all available realms",
    responses: {
      200: c.type<{
        memberships: Array<Record<string, unknown>>;
        available: Array<{ id: string; name: string; slug: string; color: string }>;
      }>(),
      ...commonErrorResponses,
    },
  },

  setLocation: {
    method: "PATCH",
    path: "/api/users/:did/location",
    pathParams: DidParam,
    summary: "Set or clear the geographic location of a user",
    body: z.object({
      lat: z.number().nullable().optional(),
      lon: z.number().optional(),
      label: z.string().optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  listGrants: {
    method: "GET",
    path: "/api/users/:did/grants",
    pathParams: DidParam,
    summary: "List grants for a user",
    responses: {
      200: z.object({ grants: z.array(UserGrantSchema) }),
      ...commonErrorResponses,
    },
  },

  createGrant: {
    method: "POST",
    path: "/api/users/:did/grants",
    pathParams: DidParam,
    summary: "Create a grant and sign delegation certificate for a user",
    body: z.object({
      agentDid: z.string().nullable().optional(),
      capabilities: z.array(z.string()),
      expiresAt: z.string().optional(),
    }),
    responses: {
      201: z.object({ grant: UserGrantSchema }),
      ...commonErrorResponses,
    },
  },

  revokeGrant: {
    method: "DELETE",
    path: "/api/users/:did/grants/:id",
    pathParams: z.object({ did: z.string(), id: z.string() }),
    summary: "Revoke a delegation grant",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  setAdmin: {
    method: "PATCH",
    path: "/api/users/:did/admin",
    pathParams: DidParam,
    summary: "Promote or demote a user to/from admin",
    body: z.object({ isAdmin: z.boolean() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});

export const meContract = c.router({
  realms: {
    method: "GET",
    path: "/api/me/realms",
    summary: "Get realms the current user belongs to",
    responses: {
      200: c.type<{
        realms: Array<{ id: string; name: string; slug: string; color: string }>;
      }>(),
      ...commonErrorResponses,
    },
  },
});

export const invitationsContract = c.router({
  get: {
    method: "GET",
    path: "/api/invitations/:token",
    pathParams: z.object({ token: z.string() }),
    summary: "Retrieve invitation details using a token",
    responses: {
      200: z.object({ email: z.string(), name: z.string(), role: z.string() }),
      ...commonErrorResponses,
    },
  },

  delete: {
    method: "POST",
    path: "/api/invitations/:token/delete",
    pathParams: z.object({ token: z.string() }),
    summary: "Delete an invitation after it's been successfully claimed",
    body: c.noBody(),
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },
});
