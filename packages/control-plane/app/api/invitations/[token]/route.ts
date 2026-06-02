/**
 * GET /api/invitations/[token]
 * Get invitation details (unauthenticated - for email invite page)
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserInvitation } from "@/lib/db";

/**
 * @openapi
 * /api/invitations/{token}:
 *   get:
 *     summary: Retrieve invitation details using a token.
 *     tags: [Invitations]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         description: The invitation token.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                 role:
 *                   type: string
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch invitation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const invitation = getUserInvitation(token);

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 404 });
    }

    return NextResponse.json({
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch invitation" }, { status: 500 });
  }
}
