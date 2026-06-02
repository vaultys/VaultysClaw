import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { createPolicy, listPolicies } from "@/lib/db";
import type { AgentCapability } from "@vaultysclaw/shared";

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
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { searchParams } = new URL(request.url);
    const agentDid = searchParams.get("agentDid") ?? undefined;
    const realmId = searchParams.get("realmId") ?? undefined;
    const includeExpired = searchParams.get("includeExpired") === "true";
    const expiredOnly = searchParams.get("expiredOnly") === "true";

    const policies = listPolicies({ agentDid, realmId, includeExpired, expiredOnly });

    return NextResponse.json({
      policies: policies.map((p) => ({
        id: p.id,
        agentDid: p.agent_did,
        realmId: p.realm_id,
        capabilities: JSON.parse(p.capabilities),
        resourceLimits: p.resource_limits ? JSON.parse(p.resource_limits) : null,
        expiresAt: p.expires_at,
        createdBy: p.created_by,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch policies" }, { status: 500 });
  }
}

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
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const body = await request.json();
    const { agentDid, realmId, capabilities, resourceLimits, expiresAt, broadcast } = body;

    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return NextResponse.json({ error: "capabilities must be a non-empty array" }, { status: 400 });
    }

    const policy = createPolicy({
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
      const applied = wsServer.applyPolicy(agentDid, capabilities as AgentCapability[], policyMeta);
      if (applied) sentTo.push(agentDid);
    }

    return NextResponse.json(
      {
        policy: {
          id: policy.id,
          agentDid: policy.agent_did,
          realmId: policy.realm_id,
          capabilities: JSON.parse(policy.capabilities),
          resourceLimits: policy.resource_limits ? JSON.parse(policy.resource_limits) : null,
          expiresAt: policy.expires_at,
          createdBy: policy.created_by,
          createdAt: policy.created_at,
        },
        sentTo,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }
}
