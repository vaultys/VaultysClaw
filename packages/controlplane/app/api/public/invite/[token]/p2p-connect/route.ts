import { NextResponse } from "next/server";
import { VaultysId } from "@vaultys/id";
import { UserLoginChannel } from "@/lib/user-login-channel";
import { parseP2PConnectWindowSeconds } from "@/lib/login-window";
import { SETTINGS_KEYS } from "@/lib/org-settings";
import { InvitationDAO, SettingsDAO } from "@/db";

/**
 * GET /api/public/invite/[token]/p2p-connect — the QR/wallet-pairing counterpart to
 * app/api/public/user/p2p-connect/route.ts, scoped to one invitation. Always registers (an invite
 * is never a login attempt for an existing Actor) — no `hasAnyHuman()` branch.
 *
 * The invitation is checked **before** anything is created. Redemption re-checks it
 * (`registerHumanFromInvitation`), so this is not what stops a bad token from registering anyone —
 * it is what stops an anonymous caller with an arbitrary path segment from opening a PeerJS channel
 * and writing an `AuthCertificate` row per request. 404 for every failure reason alike; the
 * pre-flight route (`GET /api/public/invite/[token]`) is the one that explains why.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!(await InvitationDAO.findValidByToken(token))) {
    return new NextResponse(null, { status: 404 });
  }
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
