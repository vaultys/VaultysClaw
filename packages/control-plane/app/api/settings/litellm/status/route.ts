import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getLiteLLMServiceState } from "@/lib/litellm-service";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * GET /api/settings/litellm/status
 *
 * Lightweight status check — reads in-memory service state only.
 * No external calls, no DB round-trips. Safe to poll from the sidebar.
 */
const handlers = createNextRoute(adminContract.settings, {
  litellmStatus: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const state = getLiteLLMServiceState();
    return {
      status: 200,
      body: {
        status: state.status,
        configured: state.status !== "unconfigured",
        baseUrl: state.baseUrl,
        lastError: state.lastError,
        checkedAt: state.checkedAt?.toISOString() ?? null,
      },
    };
  },
});

export const GET = handlers.GET!;
