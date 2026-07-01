import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, WorkspaceDAO } from "@/db";
import {
  createAgentKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  putLitellmKey: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!auth.isGlobalAdmin && !auth.canAdminAgent(did))
      throw new APIException("FORBIDDEN");

    if (!isLiteLLMConfigured())
      throw new APIException(
        "UNPROCESSABLE_ENTITY",
        "LiteLLM not configured — set LITELLM_BASE_URL and LITELLM_MASTER_KEY"
      );

    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND");

    let allowedModels = body.allowedModels;
    if (!allowedModels) {
      const agentWorkspaces = await AgentDAO.getWorkspaces(did);
      const primary = agentWorkspaces.find((r) => r.isPrimary) ?? agentWorkspaces[0];
      if (primary) {
        const routerKey = await WorkspaceDAO.getRouterKey(primary.workspaceId);
        allowedModels = (routerKey?.allowedModelIds as string[]) ?? [];
      }
    }
    allowedModels ??= [];

    const dailyBudget =
      body.dailyBudget === undefined
        ? ((await agent.litellmDailyBudget) ?? undefined)
        : (body.dailyBudget ?? undefined);

    const virtualKey = await createAgentKey(did, allowedModels, dailyBudget);
    await AgentDAO.updateLiteLLMKey(
      did,
      virtualKey,
      allowedModels,
      dailyBudget
    );

    if (allowedModels.length > 0) {
      const config: LlmConfig = {
        provider: "openai-compatible",
        baseUrl: getLiteLLMBaseUrl(),
        apiKey: virtualKey,
        model: allowedModels[0],
      };
      await getWSServer()?.sendLlmConfig(did, config);
    }

    return {
      status: 200,
      body: {
        ok: true,
        keyPrefix: virtualKey.slice(0, 8),
        allowedModels,
        dailyBudget: dailyBudget ?? null,
      },
    };
  },

  deleteLitellmKey: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    const { did } = params;

    if (!auth.isGlobalAdmin && !auth.canAdminAgent(did))
      throw new APIException("FORBIDDEN");

    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND");

    await AgentDAO.clearLiteLLMKey(did);

    return { status: 200, body: { ok: true } };
  },
});

export const PUT = handlers.PUT!;
export const DELETE = handlers.DELETE!;
