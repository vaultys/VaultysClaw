import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { AgentDAO, RealmDAO } from "@/db";
import {
  createAgentKey,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
} from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";
import { withError } from "@/lib/api/handlers/with-error";

type Ctx = { params: Promise<{ did: string }> };

/**
 * GET //api/agents/[did]/litellm-key
 * Returns the current per-agent LiteLLM key status (key is masked).
 */
/**
 * @openapi
 * /api/agents/{did}/litellm-key:
 *   get:
 *     summary: Retrieve the current per-agent LiteLLM key status.
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
 *         description: LiteLLM key status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configured:
 *                   type: boolean
 *                 keyPrefix:
 *                   type: string
 *                   nullable: true
 *                 allowedModels:
 *                   type: array
 *                   items:
 *                     type: string
 *                 dailyBudget:
 *                   type: number
 *                   nullable: true
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 litellmConfigured:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET = withError(async (req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { did } = await params;
  if (!auth.isGlobalAdmin && !auth.canAdminAgent(did)) return forbidden();

  const agent = await AgentDAO.findByDid(did);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const info = await AgentDAO.getLiteLLMKey(did);

  return NextResponse.json({
    configured: Boolean(info?.virtualKey),
    keyPrefix: info?.virtualKey?.slice(0, 8) ?? null,
    allowedModels: info?.allowedModels ?? [],
    dailyBudget: info?.dailyBudget ?? null,
    updatedAt: info?.updatedAt ?? null,
    litellmConfigured: isLiteLLMConfigured(),
  });
});

/**
 * PUT //api/agents/[did]/litellm-key
 * Provision or refresh the per-agent LiteLLM virtual key.
 * Body (all optional):
 *   allowedModels?: string[]   override model list (defaults to realm's)
 *   dailyBudget?: number       USD per day (null to remove limit)
 */
/**
 * @openapi
 * /api/agents/{did}/litellm-key:
 *   put:
 *     summary: Provision or refresh the per-agent LiteLLM virtual key.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the agent.
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               allowedModels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Override model list (defaults to realm's).
 *               dailyBudget:
 *                 type: number
 *                 nullable: true
 *                 description: USD per day (null to remove limit).
 *     responses:
 *       200:
 *         description: LiteLLM virtual key provisioned or refreshed successfully.
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
 *                 dailyBudget:
 *                   type: number
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const PUT = withError(async (req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { did } = await params;
  if (!auth.isGlobalAdmin && !auth.canAdminAgent(did)) return forbidden();

  if (!isLiteLLMConfigured()) {
    return NextResponse.json(
      {
        error:
          "LiteLLM not configured — set LITELLM_BASE_URL and LITELLM_MASTER_KEY",
      },
      { status: 422 }
    );
  }

  const agent = await AgentDAO.findByDid(did);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    allowedModels?: string[];
    dailyBudget?: number | null;
  };

  // Resolve model list: use body override, else inherit from primary realm
  let allowedModels = body.allowedModels;
  if (!allowedModels) {
    const agentRealms = await AgentDAO.getRealms(did);
    const primary = agentRealms.find((r) => r.isPrimary) ?? agentRealms[0];
    if (primary) {
      const routerKey = await RealmDAO.getRouterKey(primary.realmId);
      allowedModels = (routerKey?.allowedModelIds as string[]) ?? [];
    }
  }
  allowedModels ??= [];

  const dailyBudget =
    body.dailyBudget === undefined
      ? ((await AgentDAO.getLiteLLMKey(did))?.dailyBudget ?? undefined)
      : (body.dailyBudget ?? undefined);

  const virtualKey = await createAgentKey(did, allowedModels, dailyBudget);
  await AgentDAO.updateLiteLLMKey(did, virtualKey, allowedModels, dailyBudget);

  // Push updated config to agent if connected
  if (allowedModels.length > 0) {
    const model = allowedModels[0];
    const config: LlmConfig = {
      provider: "openai-compatible",
      baseUrl: getLiteLLMBaseUrl(),
      apiKey: virtualKey,
      model,
    };
    await getWSServer()?.sendLlmConfig(did, config);
  }

  return NextResponse.json({
    ok: true,
    keyPrefix: virtualKey.slice(0, 8),
    allowedModels,
    dailyBudget: dailyBudget ?? null,
  });
});

/**
 * DELETE //api/agents/[did]/litellm-key
 * Revoke the per-agent LiteLLM key (agent falls back to realm key or manual config).
 */
/**
 * @openapi
 * /api/agents/{did}/litellm-key:
 *   delete:
 *     summary: Revoke the per-agent LiteLLM key.
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
 *         description: LiteLLM key revoked successfully.
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

  const { did } = await params;
  if (!auth.isGlobalAdmin && !auth.canAdminAgent(did)) return forbidden();

  const agent = await AgentDAO.findByDid(did);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await AgentDAO.clearLiteLLMKey(did);

  return NextResponse.json({ ok: true });
});
