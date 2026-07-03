import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, ModelDAO, WorkspaceDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  createWorkspaceKey,
  createAgentKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";

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

const handlers = createNextRoute(adminContract.models, {
  // ── POST /api/models/:id/workspaces — grant workspace access (admin only) ─────────
  grantWorkspace: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(body.workspaceId)))
      throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    await ModelDAO.grantWorkspaceAccess(params.id, body.workspaceId);

    // Update workspace router key to include this model and push to workspace agents.
    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await WorkspaceDAO.getRouterKey(body.workspaceId);
        const currentModels: string[] =
          existing && Array.isArray(existing.allowedModelIds)
            ? (existing.allowedModelIds as string[])
            : [];
        if (!currentModels.includes(entry.litellmModelName)) {
          const updatedModels = [...currentModels, entry.litellmModelName];
          const { virtualKey } = await createWorkspaceKey(
            body.workspaceId,
            updatedModels,
            existing?.monthlyBudgetUsd ?? undefined
          );
          await WorkspaceDAO.upsertRouterKey(body.workspaceId, {
            litellmVirtualKey: virtualKey,
            allowedModelIds: updatedModels,
          });
          pushConfigToWorkspaceAgents(
            body.workspaceId,
            virtualKey,
            entry.litellmModelName
          );
          refreshAgentKeysForWorkspace(body.workspaceId, updatedModels);
        }
      } catch (e) {
        console.warn("LiteLLM workspace key update failed (non-fatal):", e);
      }
    }

    return { status: 200, body: undefined };
  },

  // ── DELETE /api/models/:id/workspaces?workspaceId= — revoke access (admin only) ───
  revokeWorkspace: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(query.workspaceId)))
      throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    await ModelDAO.revokeWorkspaceAccess(params.id, query.workspaceId);

    // Update workspace router key to remove this model.
    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await WorkspaceDAO.getRouterKey(query.workspaceId);
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
            query.workspaceId,
            updatedModels,
            existing.monthlyBudgetUsd ?? undefined
          );
          await WorkspaceDAO.upsertRouterKey(query.workspaceId, {
            litellmVirtualKey: virtualKey,
            allowedModelIds: updatedModels,
          });
          refreshAgentKeysForWorkspace(query.workspaceId, updatedModels);
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
