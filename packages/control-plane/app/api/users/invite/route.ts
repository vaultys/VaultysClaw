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
import { getSetting } from "@/lib/db";
import { VaultysId } from "@vaultys/id";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Always creates a registration cert (new user, never becomes owner unless first)
  const cert = UserServerChannel.createRegistrationCertificate();
  const connectionString = await UserServerChannel.startP2PSession(cert);

  const serverSecret = getSetting("serverSecret");
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
