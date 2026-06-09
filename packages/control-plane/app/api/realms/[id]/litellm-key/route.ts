import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  unprocessableEntity,
} from "@/lib/api/utils/api-utils";
import { ModelDAO, RealmDAO } from "@/db";
import {
  createRealmKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { withError } from "@/lib/api/handlers/with-error";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT /api/realms/[id]/litellm-key
 * Provision or refresh the realm's LiteLLM router virtual key.
 * Body: { monthlyBudget?: number | null }
 */
/**
 * @openapi
 * /api/realms/{id}/litellm-key:
 *   put:
 *     summary: Provision or refresh the realm's LiteLLM router virtual key.
 *     tags: [Realms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the realm.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monthlyBudget:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Successfully provisioned or refreshed the LiteLLM key.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 keyPrefix:
 *                   type: string
 *                 allowedModels:
 *                   type: array
 *                   items:
 *                     type: string
 *                 monthlyBudget:
 *                   type: number
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         description: LiteLLM not configured.
 */
export const PUT = withError(async (req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id: realmId } = await params;

  const realm = await RealmDAO.findById(realmId);
  if (!realm) return notFound("Realm not found");

  if (!isLiteLLMConfigured()) {
    return unprocessableEntity(
      "LiteLLM not configured — set it up in /models first"
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    monthlyBudget?: number | null;
  };

  // Resolve allowed models from the realm's granted model list
  const realmModels = await ModelDAO.findByRealm(realmId);
  const allowedModels = realmModels
    .filter((m) => m.litellmModelName && m.status === "active")
    .map((m) => m.litellmModelName as string);

  // Preserve existing budget if not provided in body
  const existing = await RealmDAO.getRouterKey(realmId);
  const monthlyBudget =
    body.monthlyBudget !== undefined
      ? (body.monthlyBudget ?? undefined)
      : (existing?.monthlyBudgetUsd ?? undefined);

  const { virtualKey } = await createRealmKey(
    realmId,
    allowedModels,
    monthlyBudget
  );

  await RealmDAO.upsertRouterKey(realmId, {
    litellmVirtualKey: virtualKey,
    allowedModelIds: allowedModels,
    monthlyBudgetUsd: monthlyBudget ?? null,
  });

  // Push updated config to connected agents in this realm (non-fatal)
  if (allowedModels.length > 0) {
    try {
      const agents = await RealmDAO.getAgents(realmId);
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

  return NextResponse.json({
    ok: true,
    keyPrefix: virtualKey.slice(0, 10),
    allowedModels,
    monthlyBudget: monthlyBudget ?? null,
  });
});

/**
 * DELETE /api/realms/[id]/litellm-key
 * Revoke the realm's LiteLLM router key.
 */
/**
 * @openapi
 * /api/realms/{id}/litellm-key:
 *   delete:
 *     summary: Revoke the realm's LiteLLM router key.
 *     tags: [Realms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the realm.
 *     responses:
 *       200:
 *         description: Successfully revoked the LiteLLM key.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const DELETE = withError(async (req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id: realmId } = await params;

  await RealmDAO.deleteRouterKey(realmId);

  return NextResponse.json({ ok: true });
});
