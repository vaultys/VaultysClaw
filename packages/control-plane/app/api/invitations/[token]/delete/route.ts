/**
 * DELETE /api/invitations/[token]/delete
 * Delete an invitation after it's been successfully claimed
 * Unauthenticated - called after successful wallet connection
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const db = getDb();
    db.prepare("DELETE FROM user_invitations WHERE token = ?").run(token);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting invitation:", err);
    return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
  }
}
