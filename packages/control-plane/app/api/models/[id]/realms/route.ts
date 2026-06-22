import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";
import { modelsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  createRealmKey,
  createAgentKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";

/**
 * Refresh per-agent LiteLLM keys for agents in a realm that already have a key.
 * Called after the realm's allowed model list changes.
 * Non-fatal — a per-agent key failure never blocks the route response.
 */
async function refreshAgentKeysForRealm(
  realmId: string,
  updatedModels: string[]
): Promise<void> {
  try {
    const agents = await RealmDAO.getAgents(realmId);
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
          `refreshAgentKeysForRealm: failed for ${agent.agentDid}:`,
          e
        );
      }
    }
  } catch (e) {
    console.warn("refreshAgentKeysForRealm failed (non-fatal):", e);
  }
}

/** Push a LiteLLM-routed config to all agents currently in a realm. Non-fatal. */
async function pushConfigToRealmAgents(
  realmId: string,
  virtualKey: string,
  litellmModelName: string
): Promise<void> {
  try {
    const agents = await RealmDAO.getAgents(realmId);
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
    console.warn("pushConfigToRealmAgents failed (non-fatal):", e);
  }
}

const handlers = createNextRoute(modelsContract, {
  // ── POST /api/models/:id/realms — grant realm access (admin only) ─────────
  grantRealm: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    await ModelDAO.grantRealmAccess(params.id, body.realmId);

    // Update realm router key to include this model and push to realm agents.
    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await RealmDAO.getRouterKey(body.realmId);
        const currentModels: string[] =
          existing && Array.isArray(existing.allowedModelIds)
            ? (existing.allowedModelIds as string[])
            : [];
        if (!currentModels.includes(entry.litellmModelName)) {
          const updatedModels = [...currentModels, entry.litellmModelName];
          const { virtualKey } = await createRealmKey(
            body.realmId,
            updatedModels,
            existing?.monthlyBudgetUsd ?? undefined
          );
          await RealmDAO.upsertRouterKey(body.realmId, {
            litellmVirtualKey: virtualKey,
            allowedModelIds: updatedModels,
          });
          pushConfigToRealmAgents(
            body.realmId,
            virtualKey,
            entry.litellmModelName
          );
          refreshAgentKeysForRealm(body.realmId, updatedModels);
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return { status: 200, body: undefined };
  },

  // ── DELETE /api/models/:id/realms?realmId= — revoke access (admin only) ───
  revokeRealm: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    await ModelDAO.revokeRealmAccess(params.id, query.realmId);

    // Update realm router key to remove this model.
    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await RealmDAO.getRouterKey(query.realmId);
        if (existing) {
          const currentModels: string[] = Array.isArray(
            existing.allowedModelIds
          )
            ? (existing.allowedModelIds as string[])
            : [];
          const updatedModels = currentModels.filter(
            (m) => m !== entry.litellmModelName
          );
          const { virtualKey } = await createRealmKey(
            query.realmId,
            updatedModels,
            existing.monthlyBudgetUsd ?? undefined
          );
          await RealmDAO.upsertRouterKey(query.realmId, {
            litellmVirtualKey: virtualKey,
            allowedModelIds: updatedModels,
          });
          refreshAgentKeysForRealm(query.realmId, updatedModels);
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return { status: 200, body: undefined };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;
