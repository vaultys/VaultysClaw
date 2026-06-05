/**
 * GET /api/agents/[did]/realm-llm
 * Returns the agent's realm LiteLLM routing options:
 * - which realms the agent belongs to
 * - whether each realm has a virtual key
 * - which models are accessible per realm
 * Used by the agent ConfigTab to present "Realm Routing" mode.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";

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
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = await AgentDAO.findByDid(did);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const litellmConfigured = isLiteLLMConfigured();
  const litellmBaseUrl = getLiteLLMBaseUrl();

  const memberships = await AgentDAO.getRealms(did);
  const realms = await Promise.all(
    memberships.map(async (m) => {
      const routerKey = await RealmDAO.getRouterKey(m.realmId);
      const models = (await ModelDAO.findByRealm(m.realmId))
        .filter((model) => model.status === "active" && model.litellmModelName)
        .map((model) => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          modelId: model.modelId,
          litellmModelName: model.litellmModelName,
        }));

      return {
        realmId: m.realmId,
        realmName: m.realm.name,
        isPrimary: Boolean(m.isPrimary),
        hasVirtualKey: Boolean(routerKey?.litellmVirtualKey),
        models,
      };
    })
  );

  return NextResponse.json({
    litellmConfigured,
    litellmBaseUrl,
    realms,
  });
}
