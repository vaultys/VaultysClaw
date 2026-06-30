import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ModelDAO, RealmDAO } from "@/db";
import {
  createRealmKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { realmsContract } from "@/lib/contracts";

const handlers = createNextRoute(realmsContract, {
  // ── PUT /api/realms/:id/litellm-key ───────────────────────────────────────
  putLitellmKey: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const realm = await RealmDAO.findById(params.id);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");

    if (!isLiteLLMConfigured())
      throw new APIException(
        "UNPROCESSABLE_ENTITY",
        "LiteLLM not configured — set it up in /models first"
      );

    // Resolve allowed models from the realm's granted model list
    const realmModels = await ModelDAO.findByRealm(params.id);
    const allowedModels = realmModels
      .filter((m) => m.litellmModelName && m.status === "active")
      .map((m) => m.litellmModelName as string);

    // Preserve existing budget if not provided in body
    const existing = await RealmDAO.getRouterKey(params.id);
    const monthlyBudget =
      body.monthlyBudget !== undefined
        ? (body.monthlyBudget ?? undefined)
        : (existing?.monthlyBudgetUsd ?? undefined);

    const { virtualKey } = await createRealmKey(
      params.id,
      allowedModels,
      monthlyBudget
    );

    await RealmDAO.upsertRouterKey(params.id, {
      litellmVirtualKey: virtualKey,
      allowedModelIds: allowedModels,
      monthlyBudgetUsd: monthlyBudget ?? null,
    });

    // Push updated config to connected agents in this realm (non-fatal)
    if (allowedModels.length > 0) {
      try {
        const agents = await RealmDAO.getAgents(params.id);
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
          "PUT /realms/litellm-key: push to agents failed (non-fatal):",
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

  // ── DELETE /api/realms/:id/litellm-key ────────────────────────────────────
  deleteLitellmKey: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    await RealmDAO.deleteRouterKey(params.id);
    return { status: 200, body: { ok: true } };
  },
});

export const PUT = handlers.PUT!;
export const DELETE = handlers.DELETE!;
