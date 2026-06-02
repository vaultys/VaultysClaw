/**
 * GET /api/agents/[did]/realm-llm
 * Returns the agent's realm LiteLLM routing options:
 * - which realms the agent belongs to
 * - whether each realm has a virtual key
 * - which models are accessible per realm
 * Used by the agent ConfigTab to present "Realm Routing" mode.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAgent, getAgentRealms, getRealmRouterKey, getModelsByRealm } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";

/**
 * @openapi
 * /api/agents/{did}/realm-llm:
 *   get:
 *     summary: Get the agent's realm LiteLLM routing options.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the agent.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of realms and their routing options.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 litellmConfigured:
 *                   type: boolean
 *                 litellmBaseUrl:
 *                   type: string
 *                 realms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       realmId:
 *                         type: string
 *                       realmName:
 *                         type: string
 *                       isPrimary:
 *                         type: boolean
 *                       hasVirtualKey:
 *                         type: boolean
 *                       models:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             provider:
 *                               type: string
 *                             modelId:
 *                               type: string
 *                             litellmModelName:
 *                               type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = getAgent(did);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const litellmConfigured = isLiteLLMConfigured();
  const litellmBaseUrl = getLiteLLMBaseUrl();

  const memberships = getAgentRealms(did);
  const realms = memberships.map((m) => {
    const routerKey = getRealmRouterKey(m.realm_id);
    const models = getModelsByRealm(m.realm_id)
      .filter((model) => model.status === "active" && model.litellm_model_name)
      .map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        modelId: model.model_id,
        litellmModelName: model.litellm_model_name,
      }));

    return {
      realmId: m.realm_id,
      realmName: m.name,
      isPrimary: Boolean(m.is_primary),
      hasVirtualKey: Boolean(routerKey?.litellm_virtual_key),
      models,
    };
  });

  return NextResponse.json({
    litellmConfigured,
    litellmBaseUrl,
    realms,
  });
}
