/**
 * POST /api/users/invite/from-email
 * Generate QR code from an email invitation token.
 * Unauthenticated - allows users to generate QR from their invite link.
 * Passes the unclaimed user ID through metadata so the user record gets claimed with name/email.
 */

import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";
import { malformed, notFound } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

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
export const POST = withError(async (request: NextRequest) => {
  const { token } = (await request.json()) as { token?: string };

  if (!token) {
    return malformed("Token is required");
  }

  const invitation = await UserDAO.findInvitation(token);
  if (!invitation) {
    return notFound("Invitation not found");
  }

  const expiresAt = new Date(invitation.expiresAt);
  if (expiresAt < new Date()) {
    return notFound("Invitation expired");
  }

  // Create registration certificate with pendingUserId in metadata
  const cert = await UserServerChannel.createRegistrationCertificate({
    pendingUserId: invitation.userId ?? undefined,
    invitationToken: token,
  });
  const connectionString = await UserServerChannel.startP2PSession(cert);

  const serverSecret = await SettingsDAO.get("serverSecret");
  let serverDid: string | null = null;
  if (serverSecret) {
    serverDid = VaultysId.fromSecret(serverSecret, "base64").did;
  }

  const walletUrl =
    (await SettingsDAO.get("walletUrl")) || "https://wallet.vaultys.net";
  const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
  const qrUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=auth${didParam}`;

  // Mark invitation as claimed
  await UserDAO.claimInvitation(token);

  return NextResponse.json({
    qrUrl,
    connectionString,
    inviteToken: cert.connection,
    // Raw cert key — enables the dev "connect without app" flow where the browser
    // performs the SRP itself. Same key the wallet would receive via the QR.
    key: cert.key,
    serverDid,
  });
});
