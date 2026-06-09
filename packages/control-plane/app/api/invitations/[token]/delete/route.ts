/**
 * DELETE /api/invitations/[token]/delete
 * Delete an invitation after it's been successfully claimed
 * Unauthenticated - called after successful wallet connection
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db/client";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * @openapi
 * /api/invitations/{token}/delete:
 *   post:
 *     summary: Delete an invitation after it's been successfully claimed.
 *     tags: [Invitations]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         description: The token of the invitation to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation successfully deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Failed to delete invitation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to delete invitation
 */
export const POST = withError(async (
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) => {
  const { token } = await params;
  await prisma.userInvitation.deleteMany({ where: { token } });
  return NextResponse.json({ success: true });
});
