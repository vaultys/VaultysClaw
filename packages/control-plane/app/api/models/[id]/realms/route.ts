import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
} from "@/lib/api/utils/api-utils";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";
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
    for (const { agentDid } of agents) {
      const existing = await AgentDAO.getLiteLLMKey(agentDid);
      if (!existing?.virtualKey) continue; // skip agents without a per-agent key
      try {
        const newKey = await createAgentKey(
          agentDid,
          updatedModels,
          existing.dailyBudget ?? undefined
        );
        await AgentDAO.updateLiteLLMKey(
          agentDid,
          newKey,
          updatedModels,
          existing.dailyBudget ?? undefined
        );
      } catch (e) {
        console.warn(`refreshAgentKeysForRealm: failed for ${agentDid}:`, e);
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

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/models/[id]/realms — list realms with access to this model */
/**
 * @openapi
 * /api/models/{id}/realms:
 *   get:
 *     summary: List realms with access to a specific model.
 *     tags: [Models]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the model.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of realms with access to the model.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 realms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       realmId:
 *                         type: string
 *                       realmName:
 *                         type: string
 *                       grantedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch realm access.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  if (!(await ModelDAO.findById(id))) return notFound("Model not found");

  const access = await ModelDAO.getRealmAccess(id);
  const allRealms = await RealmDAO.findAll();

  return NextResponse.json({
    realms: access.map((ra) => {
      const realm = allRealms.find((r) => r.id === ra.realmId);
      return {
        realmId: ra.realmId,
        realmName: realm?.name ?? ra.realmId,
        grantedAt: ra.grantedAt,
      };
    }),
  });
}

/** POST /api/models/[id]/realms — grant realm access. Body: { realmId } */
/**
 * @openapi
 * /api/models/{id}/realms:
 *   post:
 *     summary: Grant realm access to a model.
 *     tags: [Models]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The model ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               realmId:
 *                 type: string
 *             required:
 *               - realmId
 *     responses:
 *       200:
 *         description: Realm access granted successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to grant realm access.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const entry = await ModelDAO.findById(id);
  if (!entry) return notFound("Model not found");

  const body = (await req.json()) as { realmId?: string };
  if (!body.realmId) return malformed("realmId is required");

  await ModelDAO.grantRealmAccess(id, body.realmId);

  // Update realm router key to include this model and push to realm agents
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

  return NextResponse.json({ ok: true });
}

/** DELETE /api/models/[id]/realms/[realmId] is in a sub-route; support via query param here */
/**
 * @openapi
 * /api/models/{id}/realms:
 *   delete:
 *     summary: Revoke realm access for a model.
 *     tags: [Models]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The model ID.
 *       - in: query
 *         name: realmId
 *         required: true
 *         schema:
 *           type: string
 *         description: The realm ID to revoke access from.
 *     responses:
 *       200:
 *         description: Realm access revoked successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to revoke realm access.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const entry = await ModelDAO.findById(id);
  if (!entry) return notFound("Model not found");

  const { searchParams } = new URL(req.url);
  const realmId = searchParams.get("realmId");
  if (!realmId) return malformed("realmId query param required");

  await ModelDAO.revokeRealmAccess(id, realmId);

  // Update realm router key to remove this model
  if (isLiteLLMConfigured() && entry.litellmModelName) {
    try {
      const existing = await RealmDAO.getRouterKey(realmId);
      if (existing) {
        const currentModels: string[] = Array.isArray(existing.allowedModelIds)
          ? (existing.allowedModelIds as string[])
          : [];
        const updatedModels = currentModels.filter(
          (m) => m !== entry.litellmModelName
        );
        const { virtualKey } = await createRealmKey(
          realmId,
          updatedModels,
          existing.monthlyBudgetUsd ?? undefined
        );
        await RealmDAO.upsertRouterKey(realmId, {
          litellmVirtualKey: virtualKey,
          allowedModelIds: updatedModels,
        });
        refreshAgentKeysForRealm(realmId, updatedModels);
      }
    } catch (e) {
      console.warn("LiteLLM realm key update failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ ok: true });
}
