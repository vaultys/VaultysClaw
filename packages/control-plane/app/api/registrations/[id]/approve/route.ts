import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import type { AgentCapability } from "@vaultysclaw/shared";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  malformed,
  notFound,
  conflict,
  unavailable,
} from "@/lib/api/utils/api-utils";
import { AgentDAO, PendingRegistrationDAO, RealmDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * POST /api/registrations/[id]/approve
 * Approve a pending registration with selected capabilities and optional realm assignments
 */
/**
 * @openapi
 * /api/registrations/{id}/approve:
 *   post:
 *     summary: Approve a pending registration with selected capabilities.
 *     tags: [Registrations]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Registration ID to approve
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               capabilities:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AgentCapability'
 *               realmIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Registration approved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 registrationId:
 *                   type: string
 *                 capabilities:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AgentCapability'
 *                 agentDid:
 *                   type: string
 *                   nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Registration already processed.
 *       410:
 *         description: Agent connection no longer available.
 *       500:
 *         description: Failed to approve registration.
 *       503:
 *         description: WebSocket server not available.
 */
export const POST = withError(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const body = await request.json();
  const capabilities: AgentCapability[] = body.capabilities;
  const realmIds: string[] = Array.isArray(body.realmIds) ? body.realmIds : [];

  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return malformed("At least one capability must be assigned");
  }

  const registration = await PendingRegistrationDAO.findById(id);
  if (!registration) {
    return notFound("Registration not found");
  }

  if (registration.status !== "pending") {
    return conflict(`Registration already ${registration.status}`);
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not available");
  }

  const success = wsServer.approveRegistration(id, capabilities);
  if (!success) {
    return unavailable("Failed to approve registration");
  }

  const agentRow = await AgentDAO.findByName(registration.agentName);

  // Enroll agent in additional selected realms (default realm is already enrolled via ws-server)
  if (realmIds.length > 0 && agentRow?.did) {
    const allRealms = await RealmDAO.findAll();
    const defaultRealm = allRealms.find((r) => r.isDefault);
    for (const rid of realmIds) {
      if (defaultRealm && rid === defaultRealm.id) continue;
      try {
        await AgentDAO.addToRealm(agentRow.did, rid, false);
      } catch {
        /* already member */
      }
    }
  }
  return NextResponse.json({
    success: true,
    registrationId: id,
    capabilities,
    agentDid: agentRow?.did ?? null,
  });
});
