import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { AboutQuerySchema, AboutResponseSchema } from "./about.schemas";

/**
 * Public documentation endpoint — serves markdown docs (README, zero-trust
 * compliance…). No authentication required; lives under `/api/public`.
 */
export const aboutContract = c.router({
  get: {
    method: "GET",
    path: "/api/public/about",
    summary: "Retrieve documentation content",
    query: AboutQuerySchema,
    responses: {
      200: AboutResponseSchema,
      ...commonErrorResponses,
    },
  },
});
