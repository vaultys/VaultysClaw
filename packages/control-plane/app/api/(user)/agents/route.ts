import { getAuthContext } from "@/lib/auth-utils";
import { searchAgents } from "@/lib/api/agents-search";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * User-facing agents API. Lives in the `(user)` route group so the path
 * resolves to `/api/agents`. Scopes results to the caller's own workspaces
 * (derived from the session token) — the equivalent of the old admin
 * `mine=true` view. The global admin view is at `/api/admin/agents`.
 */
const handlers = createNextRoute(userContract.agents, {
  search: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const body = await searchAgents(query, auth.workspaceIds);
    return { status: 200, body };
  },
});

export const GET = handlers.GET!;
