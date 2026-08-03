import { NextResponse } from "next/server";
import { VaultysId } from "@vaultys/id";
import { UserLoginChannel } from "@/lib/user-login-channel";
import { SettingsDAO } from "@/db";

/**
 * GET /api/public/user/p2p-connect — open a server-side PeerJS channel and
 * run the VaultysId Challenger handshake in the background when a wallet
 * connects. The browser only needs the returned connection string to render
 * a QR code and then poll /api/public/user/listen/[token].
 */
export async function GET() {
  const hasHuman = await UserLoginChannel.hasAnyHuman();
  const cert = hasHuman
    ? await UserLoginChannel.createConnectionCertificate()
    : await UserLoginChannel.createRegistrationCertificate();

  const connectionString = await UserLoginChannel.startP2PSession(cert);

  const serverSecret = await SettingsDAO.get("serverSecret");
  const serverDid = serverSecret ? VaultysId.fromSecret(serverSecret, "base64").did : null;

  return NextResponse.json({
    connectionString,
    token: cert.connection,
    key: cert.key,
    serverDid,
  });
}
