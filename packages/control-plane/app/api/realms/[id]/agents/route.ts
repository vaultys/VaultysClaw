import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
} from "@/lib/api/utils/api-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/agents — add an agent to this realm. Realm admin or global admin.
 * Body: { agentDid, isPrimary? }
 */
/**
 * @openapi
 * /api/realms/{id}/agents:
 *   post:
 *     summary: Add an agent to a realm.
 *     tags: [Realms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the realm.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentDid:
 *                 type: string
 *                 description: The DID of the agent to add.
 *               isPrimary:
 *                 type: boolean
 *                 description: Whether the agent is primary.
 *             required:
 *               - agentDid
 *     responses:
 *       200:
 *         description: Agent added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 llmPushed:
 *                   type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to add agent to realm.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const realm = await RealmDAO.findById(id);
  if (!realm) return notFound("Realm not found");

  const body = (await req.json()) as {
    agentDid?: string;
    isPrimary?: boolean;
  };
  if (!body.agentDid) return malformed("agentDid is required");

  const agent = await AgentDAO.findByDid(body.agentDid);
  if (!agent) return notFound("Agent not found");

  await AgentDAO.addToRealm(body.agentDid, id, body.isPrimary ?? false);

  // Auto-push LiteLLM config if the realm has a virtual key and accessible models
  let llmPushed = false;
  if (isLiteLLMConfigured()) {
    try {
      const routerKey = await RealmDAO.getRouterKey(id);
      if (routerKey?.litellmVirtualKey) {
        const models = (await ModelDAO.findByRealm(id)).filter(
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

  return NextResponse.json({ ok: true, llmPushed });
}

/**
 * DELETE /api/realms/[id]/agents — remove an agent from this realm. Realm admin or global admin.
 * Body: { agentDid }
 */
/**
 * @openapi
 * /api/realms/{id}/agents:
 *   delete:
 *     summary: Remove an agent from a realm.
 *     tags: [Realms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Realm ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentDid:
 *                 type: string
 *             required:
 *               - agentDid
 *     responses:
 *       200:
 *         description: Agent removed successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to remove agent from realm.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  if (!(await auth.canAdminRealm(id))) return forbidden();

  const body = (await req.json()) as { agentDid?: string };
  if (!body.agentDid) return malformed("agentDid is required");

  const ok = await AgentDAO.removeFromRealm(body.agentDid, id);
  if (!ok) return malformed("Cannot remove agent from the default realm");

  return NextResponse.json({ ok: true });
}
