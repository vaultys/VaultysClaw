import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ModelDAO, RealmDAO } from "@/db";
import { isLiteLLMConfigured } from "@/lib/litellm-client";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { realmsContract } from "@/lib/contracts";

const handlers = createNextRoute(realmsContract, {
  // ── GET /api/realms/:id/models ────────────────────────────────────────────
  listModels: async ({ params, request }) => {
    await getAuthContext(request);

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const models = (await ModelDAO.findByRealm(params.id)).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: m.provider,
      modelId: m.modelId,
      litellmModelName: m.litellmModelName,
      status: m.status,
    }));

    const routerKey = await RealmDAO.getRouterKey(params.id);

    return {
      status: 200,
      body: {
        models,
        litellmConfigured: isLiteLLMConfigured(),
        routerKey: routerKey
          ? {
              hasVirtualKey: Boolean(routerKey.litellmVirtualKey),
              keyPrefix: routerKey.litellmVirtualKey?.slice(0, 10) ?? null,
              allowedModels: (routerKey.allowedModelIds ?? []) as string[],
              monthlyBudgetUsd: routerKey.monthlyBudgetUsd,
              updatedAt: routerKey.updatedAt
                ? new Date(routerKey.updatedAt).toISOString()
                : null,
            }
          : null,
      },
    };
  },
});

export const GET = handlers.GET!;
