import { isLiteLLMConfigured, listModels } from "@/lib/litellm-client";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.litellm, {
  // ── GET /api/litellm/models — list available LiteLLM models (admin only) ──
  models: async () => {

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
