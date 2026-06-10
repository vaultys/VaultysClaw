import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, malformed } from "@/lib/api/utils/api-utils";
import type { AgentCapability } from "@vaultysclaw/shared";
import { PolicyDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * GET /api/policies
 * List all policies. Global admin only.
 * Query params: agentDid, realmId, includeExpired
 */
/**
 * @openapi
 * /api/policies:
 *   get:
 *     summary: List all policies.
 *     tags: [Policies]
 *     parameters:
 *       - name: agentDid
 *         in: query
 *         description: Filter policies by agent DID.
 *         required: false
 *         schema:
 *           type: string
 *       - name: realmId
 *         in: query
 *         description: Filter policies by realm ID.
 *         required: false
 *         schema:
 *           type: string
 *       - name: includeExpired
 *         in: query
 *         description: Include expired policies in the results.
 *         required: false
 *         schema:
 *           type: boolean
 *       - name: expiredOnly
 *         in: query
 *         description: Return only expired policies.
 *         required: false
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: A list of policies.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 policies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       agentDid:
 *                         type: string
 *                       realmId:
 *                         type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *                       resourceLimits:
 *                         type: object
 *                         nullable: true
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       createdBy:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to fetch policies.
 */
export const GET = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { searchParams } = new URL(request.url);
  const agentDid = searchParams.get("agentDid") ?? undefined;
  const realmId = searchParams.get("realmId") ?? undefined;
  const includeExpired = searchParams.get("includeExpired") === "true";
  const expiredOnly = searchParams.get("expiredOnly") === "true";

  const policies = await PolicyDAO.list({
    agentDid,
    realmId,
    includeExpired,
    expiredOnly,
  });

  return NextResponse.json({
    policies: policies.map((p) => ({
      id: p.id,
      agentDid: p.agentDid,
      realmId: p.realmId,
      capabilities: p.capabilities,
      resourceLimits: p.resourceLimits ? p.resourceLimits : null,
      expiresAt: p.expiresAt,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    })),
  });
});

/**
 * POST /api/policies
 * Create and persist a new policy. Optionally push to agent via WebSocket. Global admin only.
 */
/**
 * @openapi
 * /api/policies:
 *   post:
 *     summary: Create and persist a new policy.
 *     tags: [Policies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentDid:
 *                 type: string
 *               realmId:
 *                 type: string
 *               capabilities:
 *                 type: array
 *                 items:
 *                   type: string
 *               resourceLimits:
 *                 type: object
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               broadcast:
 *                 type: boolean
 *             required:
 *               - capabilities
 *     responses:
 *       201:
 *         description: Policy created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 policy:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     agentDid:
 *                       type: string
 *                     realmId:
 *                       type: string
 *                     capabilities:
 *                       type: array
 *                       items:
 *                         type: string
 *                     resourceLimits:
 *                       type: object
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     createdBy:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                 sentTo:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to create policy.
 */
export const POST = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json();
  const {
    agentDid,
    realmId,
    capabilities,
    resourceLimits,
    expiresAt,
    broadcast,
  } = body;

  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return malformed("Capabilities must be a non-empty array");
  }

  const policy = await PolicyDAO.create({
    agentDid: agentDid ?? undefined,
    realmId: realmId ?? undefined,
    capabilities,
    resourceLimits: resourceLimits ?? undefined,
    expiresAt: expiresAt ?? undefined,
    createdBy: auth.did,
  });

  // Apply via cert reissue so capabilities + limits are enforced immediately.
  const wsServer = getWSServer();
  const sentTo: string[] = [];

  if (wsServer && agentDid) {
    const policyMeta = {
      resourceLimits: resourceLimits ?? null,
      policyId: policy.id,
      policyExpiresAt: expiresAt ?? null,
    };
    const applied = await wsServer.applyPolicy(
      agentDid,
      capabilities as AgentCapability[],
      policyMeta
    );
    if (applied) sentTo.push(agentDid);
  }

  return NextResponse.json(
    {
      policy: {
        id: policy.id,
        agentDid: policy.agentDid,
        realmId: policy.realmId,
        capabilities: policy.capabilities,
        resourceLimits: policy.resourceLimits ? policy.resourceLimits : null,
        expiresAt: policy.expiresAt,
        createdBy: policy.createdBy,
        createdAt: policy.createdAt,
      },
      sentTo,
    },
    { status: 201 }
  );
});
