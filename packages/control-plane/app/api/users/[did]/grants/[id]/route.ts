/**
 * DELETE /api/users/[did]/grants/[id]
 * Revoke a delegation grant. Deletes the delegation cert and notifies affected agent.
 * Owner-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";
import { GrantDAO } from "@/db";
import { forbidden, notFound } from "@/lib/api-utils";

/**
 * @openapi
 * /api/users/{did}/grants/{id}:
 *   delete:
 *     summary: Revoke a delegation grant.
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the user.
 *         schema:
 *           type: string
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the grant.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Grant successfully revoked.
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string; id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return forbidden();
  }

  const { did, id } = await params;

  const grant = await GrantDAO.findById(id);
  if (!grant || grant.userDid !== did) {
    return notFound("Grant not found");
  }

  const agentDid = grant.agentDid; // null = wildcard

  // Cascade delete handles delegation certs via DB relation
  await GrantDAO.delete(id);

  // Push updated (empty or reduced) delegation set to affected agent(s)
  const wsServer = getWSServer();
  if (wsServer) {
    if (agentDid) {
      wsServer.pushDelegationUpdate(agentDid);
    } else {
      wsServer.pushDelegationUpdateAll();
    }
  }

  return NextResponse.json({ ok: true });
}
