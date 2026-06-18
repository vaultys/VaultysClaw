import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { isLiteLLMConfigured, listModels } from "@/lib/litellm-client";
import { litellmContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(litellmContract, {
  // ── GET /api/litellm/models — list available LiteLLM models (admin only) ──
  models: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (!isLiteLLMConfigured()) {
      return { status: 200, body: { models: [], configured: false } };
    }

    const models = await listModels();
    return {
      status: 200,
      body: {
        models: models.map((m) => ({
          name: m.model_name,
          params: m.litellm_params,
        })),
        configured: true,
      },
    };
  },
});

export const GET = handlers.GET!;
