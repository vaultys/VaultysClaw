import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { PendingRegistrationDAO } from "@/db";

/**
 * POST /api/registrations/[id]/reject
 * Reject a pending registration. Global admin only.
 */
/**
 * @openapi
 * /api/registrations/{id}/reject:
 *   post:
 *     summary: Reject a pending registration.
 *     tags: [Registrations]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the registration to reject.
 *         schema:
 *           type: string
 *     requestBody:
 *       description: Reason for rejection.
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for rejecting the registration.
 *     responses:
 *       200:
 *         description: Registration successfully rejected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 registrationId:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Registration is not in a pending state.
 *       410:
 *         description: Agent connection no longer available.
 *       503:
 *         description: WebSocket server not available.
 *       500:
 *         description: Failed to reject registration.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason: string = body.reason ?? "Registration rejected by admin";

    const registration = await PendingRegistrationDAO.findById(id);
    if (!registration) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    if (registration.status !== "pending") {
      return NextResponse.json(
        { error: `Registration already ${registration.status}` },
        { status: 409 }
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WebSocket server not available" },
        { status: 503 }
      );
    }

    const success = wsServer.rejectRegistration(id, reason);
    if (!success) {
      return NextResponse.json(
        { error: "Agent connection no longer available" },
        { status: 410 }
      );
    }

    return NextResponse.json({ success: true, registrationId: id });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reject registration" },
      { status: 500 }
    );
  }
}
