/**
 * GET /api/users/invite
 * Create a registration certificate for a new (non-owner) user.
 * Returns connection info so the admin can show a QR code.
 * Owner or admin.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO } from "@/db";

/**
 * @openapi
 * /api/users/invite:
 *   get:
 *     summary: Create a registration certificate for a new user.
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Connection info for QR code display.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connectionString:
 *                   type: string
 *                 token:
 *                   type: string
 *                 key:
 *                   type: string
 *                 serverDid:
 *                   type: string
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Always creates a registration cert (new user, never becomes owner unless first)
  const cert = await UserServerChannel.createRegistrationCertificate();
  const connectionString = await UserServerChannel.startP2PSession(cert);

  const serverSecret = await SettingsDAO.get("serverSecret");
  let serverDid: string | null = null;
  if (serverSecret) {
    serverDid = VaultysId.fromSecret(serverSecret, "base64").did;
  }

  return NextResponse.json({
    connectionString,
    token: cert.connection,
    key: cert.key,
    serverDid,
  });
}
