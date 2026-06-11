/**
 * POST /api/users/claim
 * Generate a VaultysId registration QR for an authenticated OIDC user who has
 * not yet claimed their VaultysId. Requires a valid session but NOT a DID.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";
import { malformed, notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

export const POST = withError(async (request: NextRequest) => {
  const token = await getToken({ req: request });
  if (!token?.userId) {
    return unauthorized();
  }

  const user = await UserDAO.findById(token.userId);
  if (!user) {
    return notFound("User not found");
  }
  if (user.did) {
    return malformed("User already has a VaultysId");
  }

  const cert = await UserServerChannel.createRegistrationCertificate({
    pendingUserId: user.id,
  });
  console.log(`[claim] userId=${user.id} cert.id=${cert.id} cert.connection=${cert.connection}`);
  const connectionString = await UserServerChannel.startP2PSession(cert);

  const serverSecret = await SettingsDAO.get("serverSecret");
  let serverDid: string | null = null;
  if (serverSecret) {
    serverDid = VaultysId.fromSecret(serverSecret, "base64").did;
  }

  const walletUrl =
    (await SettingsDAO.get("walletUrl")) || "https://wallet.vaultys.net";
  const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
  // service=register tells the wallet to complete the full 2-round exchange for a new contact.
  // service=auth (used for login) may only trigger 1 round on the wallet side, leaving the
  // server stuck waiting for round 2 cert — hence status never reaches 2.
  const qrUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=register${didParam}`;

  return NextResponse.json({
    qrUrl,
    connectionString,
    inviteToken: cert.connection,
    serverDid,
  });
});
