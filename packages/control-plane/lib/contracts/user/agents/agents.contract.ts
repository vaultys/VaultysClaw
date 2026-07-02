import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses, PaginatedResponse } from "../../common";
import { ListUserAgentsQuerySchema } from "./agents.schemas";
import { UserAgentDetail } from "./agents.types";
import { AgentInfo } from "../../admin/agents/agents.types";

/**
 * User-facing agents API — scoped to the caller's own workspaces (derived from
 * the session token). The admin counterpart (`adminAgentsContract`) serves the
 * global view under `/api/admin/agents`.
 *
 * Routes live under `/api/agents` — the `(user)` route group is stripped from
 * the path.
 */
export const userAgentsContract = c.router({
  search: {
    method: "GET",
    path: "/api/agents",
    query: ListUserAgentsQuerySchema,
    responses: {
      200: c.type<PaginatedResponse<AgentInfo>>(),
      ...commonErrorResponses,
    },
  },

  getAgent: {
    method: "GET",
    path: "/api/agents/:did",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<UserAgentDetail>(),
      ...commonErrorResponses,
    },
  },
});
