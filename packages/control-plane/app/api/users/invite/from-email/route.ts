/**
 * POST /api/users/invite/from-email
 * Generate QR code from an email invitation token.
 * Unauthenticated - allows users to generate QR from their invite link.
 * Passes the unclaimed user ID through metadata so the user record gets claimed with name/email.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserInvitation, claimUserInvitation, getSetting, getDb } from "@/lib/db";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";

/**
 * @openapi
 * /api/users/invite/from-email:
 *   post:
 *     summary: Generate QR code from an email invitation token.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Invitation token from email.
 *             required:
 *               - token
 *     responses:
 *       200:
 *         description: QR code and connection details generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrUrl:
 *                   type: string
 *                   description: URL for the generated QR code.
 *                 connectionString:
 *                   type: string
 *                   description: Connection string for P2P session.
 *                 inviteToken:
 *                   type: string
 *                   description: Invitation token for the connection.
 *                 serverDid:
 *                   type: string
 *                   description: Server DID if available.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to generate QR code due to server error.
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json() as { token?: string };

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const invitation = getUserInvitation(token);
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 404 });
    }

    // Get the unclaimed user ID for this email
    const db = getDb();
    const user = db.prepare(
      "SELECT id FROM users WHERE email = ? AND did IS NULL"
    ).get(invitation.email) as { id: string } | undefined;

    // Create registration certificate with pendingUserId in metadata
    const cert = UserServerChannel.createRegistrationCertificate({
      pendingUserId: user?.id,
      invitationToken: token,
    });
    const connectionString = await UserServerChannel.startP2PSession(cert);

    const serverSecret = getSetting("serverSecret");
    let serverDid: string | null = null;
    if (serverSecret) {
      serverDid = VaultysId.fromSecret(serverSecret, "base64").did;
    }

    const walletUrl = getSetting("walletUrl") || "https://wallet.vaultys.net";
    const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
    const qrUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=auth${didParam}`;

    // Mark invitation as claimed
    claimUserInvitation(token);

    return NextResponse.json({
      qrUrl,
      connectionString,
      inviteToken: cert.connection,
      serverDid,
    });
  } catch (err) {
    console.error("Email invite QR generation error:", err);
    return NextResponse.json({ error: "Failed to generate QR" }, { status: 500 });
  }
}
