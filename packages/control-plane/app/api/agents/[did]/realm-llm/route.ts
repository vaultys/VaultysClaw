import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  getRealmLlm: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { did } = params;
    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const litellmConfigured = isLiteLLMConfigured();
    const litellmBaseUrl = getLiteLLMBaseUrl();

    const memberships = await AgentDAO.getRealms(did);
    const realms = await Promise.all(
      memberships.map(async (m) => {
        const routerKey = await RealmDAO.getRouterKey(m.realmId);
        const models = (await ModelDAO.findByRealm(m.realmId)).filter(
          (model) => model.status === "active" && model.litellmModelName
        );
        return {
          realmId: m.realmId,
          realmName: m.realm.name,
          isPrimary: Boolean(m.isPrimary),
          hasVirtualKey: Boolean(routerKey?.litellmVirtualKey),
          models,
        };
      })
    );

    return { status: 200, body: { litellmConfigured, litellmBaseUrl: litellmBaseUrl ?? null, realms } };
  },
});

export const GET = handlers.GET!;
