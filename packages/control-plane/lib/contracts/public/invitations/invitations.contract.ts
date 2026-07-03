import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { TokenParamSchema } from "./invitations.schemas";
import { Invitation } from "./invitations.types";

/**
 * Public invitation endpoints — reached without a session; the opaque token in
 * the path is the authorization (a valid invite link). Consumed by the public
 * invite-acceptance page (app/(public)/invite/[token]).
 */
export const invitationsContract = c.router({
  get: {
    method: "GET",
    path: "/api/public/invitations/:token",
    pathParams: TokenParamSchema,
    summary: "Retrieve invitation details using a token",
    responses: {
      200: c.type<Invitation>(),
      ...commonErrorResponses,
    },
  },

  delete: {
    method: "POST",
    path: "/api/public/invitations/:token/delete",
    pathParams: TokenParamSchema,
    summary: "Delete an invitation after it's been successfully claimed",
    body: c.noBody(),
    responses: {
      200: z.object({ success: z.boolean() }),
      ...commonErrorResponses,
    },
  },
});
