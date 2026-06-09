/**
 * GET /api/invitations/[token]
 * Get invitation details (unauthenticated - for email invite page)
 */

import { NextRequest, NextResponse } from "next/server";
import { UserDAO } from "@/db";
import { forbidden, notFound } from "@/lib/api-utils";

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
  const invitation = await UserDAO.findInvitation(token);

  if (!invitation) {
    return notFound("Invitation not found");
  }

  const expiresAt = new Date(invitation.expiresAt);
  if (expiresAt < new Date()) {
    return forbidden("Invitation expired");
  }

  return NextResponse.json({
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
  });
}
