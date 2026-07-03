import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { searchAgents } from "@/lib/api/agents-search";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.agents, {
  // Admin-only global view: searches across every agent. Members use the
  // user-facing `/api/agents` endpoint, which scopes to their own workspaces.
  search: async ({ query, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) {
      throw new APIException("FORBIDDEN");
    }

    const body = await searchAgents(query, undefined);
    return { status: 200, body };
  },
});

export const GET = handlers.GET!;
