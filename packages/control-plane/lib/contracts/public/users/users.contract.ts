import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { InviteFromEmailBodySchema } from "../../admin/users/users.schemas";

/**
 * Public user endpoints — reached without a session (invitee clicks an email
 * link). User management lives under adminContract.users; self-service under
 * userContract.users.
 */
export const usersPublicContract = c.router({
  inviteFromEmail: {
    method: "POST",
    path: "/api/public/users/invite/from-email",
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
});
