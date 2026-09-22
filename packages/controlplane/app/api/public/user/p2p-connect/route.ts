import { NextResponse } from "next/server";
import { VaultysId } from "@vaultys/id";
import { UserLoginChannel } from "@/lib/user-login-channel";
import { parseP2PConnectWindowSeconds } from "@/lib/login-window";
import { SETTINGS_KEYS } from "@/lib/org-settings";
import { SettingsDAO } from "@/db";

/**
 * GET /api/public/user/p2p-connect — open a server-side PeerJS channel and
 * run the VaultysId Challenger handshake in the background when a wallet
 * connects. The browser only needs the returned connection string to render
 * a QR code and then poll /api/public/user/listen/[token].
 *
 * `connectWindowSeconds` comes back with it: the same number the background session is bounded by,
 * so the page can count it down instead of spinning indefinitely against a server that has already
 * given up. Read once here and passed both ways, rather than read independently on each side.
 */
export async function GET() {
  const hasHuman = await UserLoginChannel.hasAnyHuman();
  const cert = hasHuman
    ? await UserLoginChannel.createConnectionCertificate()
    : await UserLoginChannel.createRegistrationCertificate();

  const connectWindowSeconds = parseP2PConnectWindowSeconds(
    await SettingsDAO.get(SETTINGS_KEYS.p2pConnectWindowSeconds)
  );
  const connectionString = await UserLoginChannel.startP2PSession(
    cert,
    connectWindowSeconds * 1000
  );

  const serverSecret = await SettingsDAO.get("serverSecret");
  const serverDid = serverSecret ? VaultysId.fromSecret(serverSecret, "base64").did : null;

  return NextResponse.json({
    connectionString,
    token: cert.connection,
    key: cert.key,
    serverDid,
    connectWindowSeconds,
  });
}
