import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { UserStatusResponseSchema } from "./user-status.schemas";

export const userStatusContract = c.router({
  status: {
    method: "GET",
    path: "/api/user/status",
    summary: "Retrieve the user status and server DID",
    responses: {
      200: UserStatusResponseSchema,
      ...commonErrorResponses,
    },
  },
});
