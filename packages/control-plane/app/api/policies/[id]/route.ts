import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getPolicy, deletePolicy, getAgent } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";
import type { AgentCapability } from "@vaultysclaw/shared";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/policies/[id]
 */
/**
 * @openapi
 * /api/policies/{id}:
 *   get:
 *     summary: Retrieve a policy by ID.
 *     tags: [Policies]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the policy to retrieve.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy retrieved successfully.
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
 *                         type: object
 *                     resourceLimits:
 *                       type: object
 *                       nullable: true
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     createdBy:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch policy.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await ctx.params;
    const policy = getPolicy(id);
    if (!policy)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      policy: {
        id: policy.id,
        agentDid: policy.agent_did,
        realmId: policy.realm_id,
        capabilities: JSON.parse(policy.capabilities),
        resourceLimits: policy.resource_limits
          ? JSON.parse(policy.resource_limits)
          : null,
        expiresAt: policy.expires_at,
        createdBy: policy.created_by,
        createdAt: policy.created_at,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch policy" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/policies/[id]
 * Revoke a policy. Global admin only.
 * If the policy was bound to a specific agent that is currently connected,
 * a cert reissue is triggered so the removed limits take effect immediately.
 */
/**
 * @openapi
 * /api/policies/{id}:
 *   delete:
 *     summary: Revoke a policy.
 *     tags: [Policies]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the policy to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy successfully revoked.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 sentTo:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete policy.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await ctx.params;

    // Fetch before deleting so we know which agent / capabilities to reissue
    const policy = getPolicy(id);
    if (!policy)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const deleted = deletePolicy(id);
    if (!deleted)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // If the policy was bound to a specific agent, reissue its cert immediately
    // so the removed resource limits are no longer enforced.
    const sentTo: string[] = [];
    if (policy.agent_did) {
      const wsServer = getWSServer();
      if (wsServer) {
        const agent = getAgent(policy.agent_did);
        // Use the capabilities stored on the policy (what it granted) but clear
        // all governance metadata — policyId null signals "no active policy".
        const capabilities = JSON.parse(
          policy.capabilities
        ) as AgentCapability[];
        const applied = wsServer.applyPolicy(policy.agent_did, capabilities, {
          resourceLimits: null,
          policyId: null,
          policyExpiresAt: null,
        });
        if (applied) sentTo.push(policy.agent_did);
      }
    }

    return NextResponse.json({ ok: true, sentTo });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete policy" },
      { status: 500 }
    );
  }
}
