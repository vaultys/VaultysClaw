import { NextResponse } from "next/server";
import { VaultysId } from "@vaultys/id";
import { UserLoginChannel } from "@/lib/user-login-channel";
import { parseP2PConnectWindowSeconds } from "@/lib/login-window";
import { SETTINGS_KEYS } from "@/lib/org-settings";
import { SettingsDAO } from "@/db";

/**
 * GET /api/public/invite/[token]/p2p-connect — the QR/wallet-pairing counterpart to
 * app/api/public/user/p2p-connect/route.ts, scoped to one invitation. Always registers (an invite
 * is never a login attempt for an existing Actor) — no `hasAnyHuman()` branch.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const cert = await UserLoginChannel.createRegistrationCertificate(token);
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
