import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ModelDAO, WorkspaceDAO } from "@/db";
import { isLiteLLMConfigured } from "@/lib/litellm-client";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.workspaces, {
  // ── GET /api/workspaces/:id/models ────────────────────────────────────────────
  listModels: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    if (!(await auth.canAccessWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const models = (await ModelDAO.findByWorkspace(params.id)).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: m.provider,
      modelId: m.modelId,
      litellmModelName: m.litellmModelName,
      status: m.status,
    }));

    const routerKey = await WorkspaceDAO.getRouterKey(params.id);

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
