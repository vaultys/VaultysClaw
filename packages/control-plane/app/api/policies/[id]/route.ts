import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";

import { PolicyDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

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
export const GET = withError(async (_req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  const policy = await PolicyDAO.findById(id);
  if (!policy) return notFound("Policy not found");

  return NextResponse.json({
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
  });
});

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
export const DELETE = withError(async (_req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;

  // Fetch before deleting so we know which agent / capabilities to reissue
  const policy = await PolicyDAO.findById(id);
  if (!policy) return notFound("Policy not found");

  const deleted = await PolicyDAO.delete(id);
  if (!deleted) return notFound("Policy not found");

  // If the policy was bound to a specific agent, reissue its cert immediately
  // with an empty capability set. The previous code mistakenly re-sent the
  // policy's own capabilities here, leaving the agent with full access even
  // after revocation. Revoking a policy means revoking what it granted.
  const sentTo: string[] = [];
  if (policy.agentDid) {
    const wsServer = getWSServer();
    if (wsServer) {
      const applied = await wsServer.applyPolicy(
        policy.agentDid,
        [],
        {
          resourceLimits: null,
          policyId: null,
          policyExpiresAt: null,
        }
      );
      if (applied) sentTo.push(policy.agentDid);
    }
  }

  return NextResponse.json({ ok: true, sentTo });
});
