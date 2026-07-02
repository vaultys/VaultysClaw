import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { AgentDAO, ModelDAO, WorkspaceDAO } from "@/db";
import { adminAgentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminAgentsContract, {
  getWorkspaceLlm: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { did } = params;
    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    const litellmConfigured = isLiteLLMConfigured();
    const litellmBaseUrl = getLiteLLMBaseUrl();

    const memberships = await AgentDAO.getWorkspaces(did);
    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const routerKey = await WorkspaceDAO.getRouterKey(m.workspaceId);
        const models = (await ModelDAO.findByWorkspace(m.workspaceId)).filter(
          (model) => model.status === "active" && model.litellmModelName
        );
        return {
          workspaceId: m.workspaceId,
          workspaceName: m.workspace.name,
          isPrimary: Boolean(m.isPrimary),
          hasVirtualKey: Boolean(routerKey?.litellmVirtualKey),
          models,
        };
      })
    );

    return { status: 200, body: { litellmConfigured, litellmBaseUrl: litellmBaseUrl ?? null, workspaces } };
  },
});

export const GET = handlers.GET!;
