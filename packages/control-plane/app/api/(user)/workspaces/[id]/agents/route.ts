import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { AgentDAO, ModelDAO, WorkspaceDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";
import { enqueueNotification } from "@/lib/notification-queue";

const handlers = createNextRoute(userContract.workspaces, {
  // ── POST /api/workspaces/:id/agents ───────────────────────────────────────────
  addAgent: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const workspace = await WorkspaceDAO.findById(params.id);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");

    const agent = await AgentDAO.findByDid(body.agentDid);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    await AgentDAO.addToWorkspace(body.agentDid, params.id, body.isPrimary ?? false);

    void enqueueNotification({
      eventType: "workspace.agent_added",
      data: {
        workspaceId: params.id,
        workspaceName: workspace.name,
        agentName: agent.name,
        actorDid: auth.did,
      },
    });

    // Auto-push LiteLLM config if the workspace has a virtual key and active models
    let llmPushed = false;
    if (isLiteLLMConfigured()) {
      try {
        const routerKey = await WorkspaceDAO.getRouterKey(params.id);
        if (routerKey?.litellmVirtualKey) {
          const models = (await ModelDAO.findByWorkspace(params.id)).filter(
            (m) => m.status === "active" && m.litellmModelName
          );
          const firstModel = models[0];
          if (firstModel?.litellmModelName) {
            const config: LlmConfig = {
              provider: "openai-compatible",
              baseUrl: getLiteLLMBaseUrl(),
              apiKey: routerKey.litellmVirtualKey,
              model: firstModel.litellmModelName,
            };
            await AgentDAO.setLlmConfig(body.agentDid, config);
            const wsServer = getWSServer();
            llmPushed =
              (await wsServer?.sendLlmConfig(body.agentDid, config)) ?? false;
          }
        }
      } catch (e) {
        console.warn("LiteLLM agent config push failed (non-fatal):", e);
      }
    }

    return { status: 200, body: { ok: true, llmPushed } };
  },

  // ── DELETE /api/workspaces/:id/agents ─────────────────────────────────────────
  removeAgent: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminWorkspace(params.id)))
      throw new APIException("FORBIDDEN");

    const agent = await AgentDAO.findByDid(body.agentDid);
    const workspace = await WorkspaceDAO.findById(params.id);

    const ok = await AgentDAO.removeFromWorkspace(body.agentDid, params.id);
    if (!ok)
      throw new APIException(
        "MALFORMED",
        "Cannot remove agent from the default workspace"
      );

    void enqueueNotification({
      eventType: "workspace.agent_removed",
      data: {
        workspaceId: params.id,
        workspaceName: workspace?.name,
        agentName: agent?.name,
        actorDid: auth.did,
      },
    });

    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;
