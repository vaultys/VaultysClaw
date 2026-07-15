import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  UpdateMeBodySchema,
  SearchUsersQuerySchema,
} from "../../admin/users/users.schemas";
import type { MeProfile, UpdateMeResponse } from "../../admin/users/users.types";

/**
 * Self-service user endpoints — any authenticated user (own profile, user
 * search, admin directory, claiming a VaultysId). Admin user management lives
 * under adminContract.users.
 */
export const usersUserContract = c.router({
  me: {
    method: "GET",
    path: "/api/users/me",
    summary: "Return the current user's profile",
    responses: { 200: c.type<MeProfile>(), ...commonErrorResponses },
  },

  updateMe: {
    method: "PATCH",
    path: "/api/users/me",
    summary: "Update the current user's own editable fields",
    body: UpdateMeBodySchema,
    responses: { 200: c.type<UpdateMeResponse>(), ...commonErrorResponses },
  },

  search: {
    method: "GET",
    path: "/api/users/search",
    summary: "List users in a workspace with optional search by name/email",
    query: SearchUsersQuerySchema,
    responses: {
      200: c.type<{
        users: Array<{ id: string; name: string; email: string; joinedAt: string }>;
      }>(),
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
});
