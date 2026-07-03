import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";

export const setupContract = c.router({
  status: {
    method: "GET",
    path: "/api/admin/setup/status",
    summary: "Check which setup steps are completed",
    responses: {
      200: z.object({
        status: z.object({
          model: z.boolean(),
          email: z.boolean(),
          users: z.boolean(),
          agent: z.boolean(),
        }),
      }),
      ...commonErrorResponses,
    },
  },
});
