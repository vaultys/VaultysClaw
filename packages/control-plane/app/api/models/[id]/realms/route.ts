import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";
import {
  createRealmKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";

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
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    if (!await ModelDAO.findById(id))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch realm access" },
      { status: 500 }
    );
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
    const entry = await ModelDAO.findById(id);
    if (!entry)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await req.json()) as { realmId?: string };
    if (!body.realmId)
      return NextResponse.json(
        { error: "realmId is required" },
        { status: 400 }
      );

    await ModelDAO.grantRealmAccess(id, body.realmId);

    // Update realm router key to include this model and push to realm agents
    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        const existing = await RealmDAO.getRouterKey(body.realmId);
        const currentModels: string[] = existing && Array.isArray(existing.allowedModelIds)
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
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to grant realm access" },
      { status: 500 }
    );
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
    const entry = await ModelDAO.findById(id);
    if (!entry)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const realmId = searchParams.get("realmId");
    if (!realmId)
      return NextResponse.json(
        { error: "realmId query param required" },
        { status: 400 }
      );

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
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to revoke realm access" },
      { status: 500 }
    );
  }
}
