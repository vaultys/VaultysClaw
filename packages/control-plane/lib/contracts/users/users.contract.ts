import { z } from "zod";
import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  DidParamSchema,
  IdParamSchema,
  DidGrantParamSchema,
  TokenParamSchema,
  UserGrantSchema,
  ListUsersQuerySchema,
  SearchUsersQuerySchema,
  InviteQuerySchema,
  UpdateMeBodySchema,
  InviteEmailBodySchema,
  InviteFromEmailBodySchema,
  UpdateUserBodySchema,
  SendUnclaimedQrBodySchema,
  SetUserLocationBodySchema,
  CreateGrantBodySchema,
  SetAdminBodySchema,
} from "./users.schemas";
import type {
  Invitation,
  MeProfile,
  UnclaimedUserDetail,
  UpdateMeResponse,
  UserDetail,
  UserListResponse,
} from "./users.types";

export const usersContract = c.router({
  list: {
    method: "GET",
    path: "/api/users",
    summary: "List users with optional pagination and filters",
    query: ListUsersQuerySchema,
    responses: {
      200: c.type<UserListResponse>(),
      ...commonErrorResponses,
    },
  },

  me: {
    method: "GET",
    path: "/api/users/me",
    summary: "Return the current user's profile",
    responses: {
      200: c.type<MeProfile>(),
      ...commonErrorResponses,
    },
  },

  updateMe: {
    method: "PATCH",
    path: "/api/users/me",
    summary: "Update the current user's own editable fields",
    body: UpdateMeBodySchema,
    responses: {
      200: c.type<UpdateMeResponse>(),
      ...commonErrorResponses,
    },
  },

  search: {
    method: "GET",
    path: "/api/users/search",
    summary: "List users in a workspace with optional search by name/email",
    query: SearchUsersQuerySchema,
    responses: {
      200: c.type<{
        users: Array<{
          id: string;
          name: string;
          email: string;
          joinedAt: string;
        }>;
      }>(),
      ...commonErrorResponses,
    },
  },

  invite: {
    method: "GET",
    path: "/api/users/invite",
    summary: "Create a registration certificate for a new user",
    query: InviteQuerySchema,
    responses: {
      200: z.object({
        connectionString: z.string(),
        token: z.string(),
        key: z.string(),
        serverDid: z.string().nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  inviteFromEmail: {
    method: "POST",
    path: "/api/users/invite/from-email",
    summary: "Generate QR code from an email invitation token",
    body: InviteFromEmailBodySchema,
    responses: {
      200: z.object({
        qrUrl: z.string(),
        connectionString: z.string(),
        inviteToken: z.string(),
        key: z.string(),
        serverDid: z.string().nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  claim: {
    method: "POST",
    path: "/api/users/claim",
    summary:
      "Generate a VaultysId registration QR for an authenticated OIDC user",
    body: c.noBody(),
    responses: {
      200: z.object({
        qrUrl: z.string(),
        connectionString: z.string(),
        inviteToken: z.string(),
        key: z.string(),
        serverDid: z.string().nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  admins: {
    method: "GET",
    path: "/api/users/admins",
    summary: "List global admins (name + email only)",
    responses: {
      200: z.object({
        admins: z.array(
          z.object({
            name: z.string().nullable(),
            email: z.string().nullable(),
          })
        ),
      }),
      ...commonErrorResponses,
    },
  },

  inviteEmail: {
    method: "POST",
    path: "/api/users/invite/email",
    summary: "Send an email invitation to a new user",
    body: InviteEmailBodySchema,
    responses: {
      200: z.object({ token: z.string(), userId: z.string() }),
      ...commonErrorResponses,
    },
  },

  getUnclaimed: {
    method: "GET",
    path: "/api/users/unclaimed/:id",
    pathParams: IdParamSchema,
    summary: "Get an unclaimed Entra user by internal ID",
    responses: {
      200: c.type<UnclaimedUserDetail>(),
      ...commonErrorResponses,
    },
  },

  updateUnclaimed: {
    method: "PATCH",
    path: "/api/users/unclaimed/:id",
    pathParams: IdParamSchema,
    summary: "Update profile fields of an unclaimed user",
    body: UpdateUserBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  removeUnclaimed: {
    method: "DELETE",
    path: "/api/users/unclaimed/:id",
    pathParams: IdParamSchema,
    summary: "Remove an unclaimed user by internal ID",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  sendUnclaimedQr: {
    method: "POST",
    path: "/api/users/unclaimed/:id/send-qr",
    pathParams: IdParamSchema,
    summary: "Send a QR code to an unclaimed user via email",
    body: SendUnclaimedQrBodySchema,
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
    pathParams: DidParamSchema,
    summary: "Get a single user by DID",
    responses: {
      200: c.type<UserDetail>(),
      ...commonErrorResponses,
    },
  },

  update: {
    method: "PATCH",
    path: "/api/users/:did",
    pathParams: DidParamSchema,
    summary: "Update a user's profile fields",
    body: UpdateUserBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/users/:did",
    pathParams: DidParamSchema,
    summary: "Remove a user and all their grants (owner-only)",
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  setLocation: {
    method: "PATCH",
    path: "/api/users/:did/location",
    pathParams: DidParamSchema,
    summary: "Set or clear the geographic location of a user",
    body: SetUserLocationBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  listGrants: {
    method: "GET",
    path: "/api/users/:did/grants",
    pathParams: DidParamSchema,
    summary: "List grants for a user",
    responses: {
      200: z.object({ grants: z.array(UserGrantSchema) }),
      ...commonErrorResponses,
    },
  },

  createGrant: {
    method: "POST",
    path: "/api/users/:did/grants",
    pathParams: DidParamSchema,
    summary: "Create a grant and sign delegation certificate for a user",
    body: CreateGrantBodySchema,
    responses: {
      201: z.object({ grant: UserGrantSchema }),
      ...commonErrorResponses,
    },
  },

  revokeGrant: {
    method: "DELETE",
    path: "/api/users/:did/grants/:id",
    pathParams: DidGrantParamSchema,
    summary: "Revoke a delegation grant",
    responses: {
      200: z.object({ ok: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  setAdmin: {
    method: "PATCH",
    path: "/api/users/:did/admin",
    pathParams: DidParamSchema,
    summary: "Promote or demote a user to/from admin",
    body: SetAdminBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});

export const invitationsContract = c.router({
  get: {
    method: "GET",
    path: "/api/invitations/:token",
    pathParams: TokenParamSchema,
    summary: "Retrieve invitation details using a token",
    responses: {
      200: c.type<Invitation>(),
      ...commonErrorResponses,
    },
  },

  delete: {
    method: "POST",
    path: "/api/invitations/:token/delete",
    pathParams: TokenParamSchema,
    summary: "Delete an invitation after it's been successfully claimed",
    body: c.noBody(),
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },
});
