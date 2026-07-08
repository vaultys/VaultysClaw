import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, ModelDAO, WorkspaceDAO } from "@/db";
import {
  createWorkspaceKey,
  createAgentKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

/**
 * Refresh per-agent LiteLLM keys for agents in a workspace that already have a key.
 * Called after the workspace's allowed model list changes.
 * Non-fatal — a per-agent key failure never blocks the route response.
 */
async function refreshAgentKeysForWorkspace(
  workspaceId: string,
  updatedModels: string[]
): Promise<void> {
  try {
    const agents = await WorkspaceDAO.getAgents(workspaceId);
    for (const agent of agents) {
      if (!agent?.agent.litellmVirtualKey) continue; // skip agents without a per-agent key
      try {
        const newKey = await createAgentKey(
          agent.agentDid,
          updatedModels,
          agent.agent.litellmDailyBudget ?? undefined
        );
        await AgentDAO.updateLiteLLMKey(
          agent.agentDid,
          newKey,
          updatedModels,
          agent.agent.litellmDailyBudget ?? undefined
        );
      } catch (e) {
        console.warn(
          `refreshAgentKeysForWorkspace: failed for ${agent.agentDid}:`,
          e
        );
      }
    }
  } catch (e) {
    console.warn("refreshAgentKeysForWorkspace failed (non-fatal):", e);
  }
}

/** Push a LiteLLM-routed config to all agents currently in a workspace. Non-fatal. */
async function pushConfigToWorkspaceAgents(
  workspaceId: string,
  virtualKey: string,
  litellmModelName: string
): Promise<void> {
  try {
    const agents = await WorkspaceDAO.getAgents(workspaceId);
    if (agents.length === 0) return;
    const config: LlmConfig = {
      provider: "openai-compatible",
      baseUrl: getLiteLLMBaseUrl(),
      apiKey: virtualKey,
      model: litellmModelName,
    };
    const wsServer = getWSServer();
    for (const agent of agents) {
      await AgentDAO.setLlmConfig(agent.agentDid, config);
      wsServer?.sendLlmConfig(agent.agentDid, config);
    }
  } catch (e) {
    console.warn("pushConfigToWorkspaceAgents failed (non-fatal):", e);
  }
}

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

  // ── POST /api/workspaces/:id/models — grant a model access to this workspace ──────
  grantModel: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(body.modelId);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    await ModelDAO.grantWorkspaceAccess(body.modelId, params.id);

    // Update workspace router key to include this model and push to workspace agents.
    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await WorkspaceDAO.getRouterKey(params.id);
        const currentModels: string[] =
          existing && Array.isArray(existing.allowedModelIds)
            ? (existing.allowedModelIds as string[])
            : [];
        if (!currentModels.includes(entry.litellmModelName)) {
          const updatedModels = [...currentModels, entry.litellmModelName];
          const { virtualKey } = await createWorkspaceKey(
            params.id,
            updatedModels,
            existing?.monthlyBudgetUsd ?? undefined
          );
          await WorkspaceDAO.upsertRouterKey(params.id, {
            litellmVirtualKey: virtualKey,
            allowedModelIds: updatedModels,
          });
          pushConfigToWorkspaceAgents(
            params.id,
            virtualKey,
            entry.litellmModelName
          );
          refreshAgentKeysForWorkspace(params.id, updatedModels);
        }
      } catch (e) {
        console.warn("LiteLLM workspace key update failed (non-fatal):", e);
      }
    }

    return { status: 200, body: undefined };
  },

  // ── DELETE /api/workspaces/:id/models?modelId= — revoke a model's access ──────────
  revokeModel: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(query.modelId);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    await ModelDAO.revokeWorkspaceAccess(query.modelId, params.id);

    // Update workspace router key to remove this model.
    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await WorkspaceDAO.getRouterKey(params.id);
        if (existing) {
          const currentModels: string[] = Array.isArray(
            existing.allowedModelIds
          )
            ? (existing.allowedModelIds as string[])
            : [];
          const updatedModels = currentModels.filter(
            (m) => m !== entry.litellmModelName
          );
          const { virtualKey } = await createWorkspaceKey(
            params.id,
            updatedModels,
            existing.monthlyBudgetUsd ?? undefined
          );
          await WorkspaceDAO.upsertRouterKey(params.id, {
            litellmVirtualKey: virtualKey,
            allowedModelIds: updatedModels,
          });
          refreshAgentKeysForWorkspace(params.id, updatedModels);
        }
      } catch (e) {
        console.warn("LiteLLM workspace key update failed (non-fatal):", e);
      }
    }

    return { status: 200, body: undefined };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;
