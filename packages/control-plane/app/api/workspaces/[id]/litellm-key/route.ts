import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ModelDAO, WorkspaceDAO } from "@/db";
import {
  createWorkspaceKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { workspacesContract } from "@/lib/contracts";

const handlers = createNextRoute(workspacesContract, {
  // ── PUT /api/workspaces/:id/litellm-key ───────────────────────────────────────
  putLitellmKey: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    if (!isLiteLLMConfigured())
      throw new APIException(
        "UNPROCESSABLE_ENTITY",
        "LiteLLM not configured — set it up in /models first"
      );

    // Resolve allowed models from the workspace's granted model list
    const workspaceModels = await ModelDAO.findByWorkspace(params.id);
    const allowedModels = workspaceModels
      .filter((m) => m.litellmModelName && m.status === "active")
      .map((m) => m.litellmModelName as string);

    // Preserve existing budget if not provided in body
    const existing = await WorkspaceDAO.getRouterKey(params.id);
    const monthlyBudget =
      body.monthlyBudget !== undefined
        ? (body.monthlyBudget ?? undefined)
        : (existing?.monthlyBudgetUsd ?? undefined);

    const { virtualKey } = await createWorkspaceKey(
      params.id,
      allowedModels,
      monthlyBudget
    );

    await WorkspaceDAO.upsertRouterKey(params.id, {
      litellmVirtualKey: virtualKey,
      allowedModelIds: allowedModels,
      monthlyBudgetUsd: monthlyBudget ?? null,
    });

    // Push updated config to connected agents in this workspace (non-fatal)
    if (allowedModels.length > 0) {
      try {
        const agents = await WorkspaceDAO.getAgents(params.id);
        const config: LlmConfig = {
          provider: "openai-compatible",
          baseUrl: getLiteLLMBaseUrl(),
          apiKey: virtualKey,
          model: allowedModels[0],
        };
        const ws = getWSServer();
        for (const { agentDid } of agents) {
          ws?.sendLlmConfig(agentDid, config);
        }
      } catch (e) {
        console.warn(
          "PUT /workspaces/litellm-key: push to agents failed (non-fatal):",
          e
        );
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        keyPrefix: virtualKey.slice(0, 10),
        allowedModels,
        monthlyBudget: monthlyBudget ?? null,
      },
    };
  },

  // ── DELETE /api/workspaces/:id/litellm-key ────────────────────────────────────
  deleteLitellmKey: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    await WorkspaceDAO.deleteRouterKey(params.id);
    return { status: 200, body: { ok: true } };
  },
});

export const PUT = handlers.PUT!;
export const DELETE = handlers.DELETE!;
