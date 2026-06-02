import { NextRequest, NextResponse } from "next/server";
import {
  getModelRegistryEntry,
  getModelRealmAccess,
  grantModelRealmAccess,
  revokeModelRealmAccess,
  getAllRealms,
  getRealmRouterKey,
  upsertRealmRouterKey,
  getRealmAgents,
  setAgentLlmConfig,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { createRealmKey, isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";

/** Push a LiteLLM-routed config to all agents currently in a realm. Non-fatal. */
function pushConfigToRealmAgents(
  realmId: string,
  virtualKey: string,
  litellmModelName: string,
): void {
  try {
    const agents = getRealmAgents(realmId);
    if (agents.length === 0) return;
    const config: LlmConfig = {
      provider: "openai-compatible",
      baseUrl: getLiteLLMBaseUrl(),
      apiKey: virtualKey,
      model: litellmModelName,
    };
    const wsServer = getWSServer();
    for (const agent of agents) {
      setAgentLlmConfig(agent.agent_did, config);
      wsServer?.sendLlmConfig(agent.agent_did, config);
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
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    if (!getModelRegistryEntry(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = getModelRealmAccess(id);
    const allRealms = getAllRealms();

    return NextResponse.json({
      realms: access.map((ra) => {
        const realm = allRealms.find((r) => r.id === ra.realm_id);
        return { realmId: ra.realm_id, realmName: realm?.name ?? ra.realm_id, grantedAt: ra.granted_at };
      }),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch realm access" }, { status: 500 });
  }
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
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json() as { realmId?: string };
    if (!body.realmId) return NextResponse.json({ error: "realmId is required" }, { status: 400 });

    grantModelRealmAccess(id, body.realmId);

    // Update realm router key to include this model and push to realm agents
    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try {
        const existing = getRealmRouterKey(body.realmId);
        const currentModels: string[] = existing ? JSON.parse(existing.allowed_model_ids) : [];
        if (!currentModels.includes(entry.litellm_model_name)) {
          const updatedModels = [...currentModels, entry.litellm_model_name];
          const { virtualKey } = await createRealmKey(body.realmId, updatedModels, existing?.monthly_budget_usd ?? undefined);
          upsertRealmRouterKey(body.realmId, { litellmVirtualKey: virtualKey, allowedModelIds: updatedModels });
          pushConfigToRealmAgents(body.realmId, virtualKey, entry.litellm_model_name);
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to grant realm access" }, { status: 500 });
  }
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
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const realmId = searchParams.get("realmId");
    if (!realmId) return NextResponse.json({ error: "realmId query param required" }, { status: 400 });

    revokeModelRealmAccess(id, realmId);

    // Update realm router key to remove this model
    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try {
        const existing = getRealmRouterKey(realmId);
        if (existing) {
          const currentModels: string[] = JSON.parse(existing.allowed_model_ids);
          const updatedModels = currentModels.filter((m) => m !== entry.litellm_model_name);
          const { virtualKey } = await createRealmKey(realmId, updatedModels, existing.monthly_budget_usd ?? undefined);
          upsertRealmRouterKey(realmId, { litellmVirtualKey: virtualKey, allowedModelIds: updatedModels });
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to revoke realm access" }, { status: 500 });
  }
}
