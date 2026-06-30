import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { realmsContract } from "@/lib/contracts";

const handlers = createNextRoute(realmsContract, {
  // ── POST /api/realms/:id/agents ───────────────────────────────────────────
  addAgent: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    const agent = await AgentDAO.findByDid(body.agentDid);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    await AgentDAO.addToRealm(body.agentDid, params.id, body.isPrimary ?? false);

    // Auto-push LiteLLM config if the realm has a virtual key and active models
    let llmPushed = false;
    if (isLiteLLMConfigured()) {
      try {
        const routerKey = await RealmDAO.getRouterKey(params.id);
        if (routerKey?.litellmVirtualKey) {
          const models = (await ModelDAO.findByRealm(params.id)).filter(
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

  // ── DELETE /api/realms/:id/agents ─────────────────────────────────────────
  removeAgent: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!(await auth.canAdminRealm(params.id)))
      throw new APIException("FORBIDDEN");

    const ok = await AgentDAO.removeFromRealm(body.agentDid, params.id);
    if (!ok)
      throw new APIException(
        "MALFORMED",
        "Cannot remove agent from the default realm"
      );

    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;
