import { NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { UserDao } from "@/lib/user-dao";
import { getSetting } from "@/lib/db";
import { VaultysId } from "@vaultys/id";

/**
 * GET /api/user/p2p/connect
 *
 * Opens a server-side PeerJS channel, runs the full Challenger auth when the
 * wallet connects, and updates the certificate in the DB on completion.
 *
 * Returns:
 *   - connectionString: PeerJS vaultys://peerjs?... URI (embedded in QR)
 *   - token: connection token (sha256 hash) — browser polls /api/user/listen/[token]
 *   - key: raw cert key — browser passes to next-auth signIn as credentials.token
 *   - serverDid: server VaultysID DID — appended to the QR URL
 */
export async function GET() {
  const shouldRegister = !UserDao.hasAnyUser();
  console.log(`[p2p/connect] hasAnyUser=${!shouldRegister} → cert type=${shouldRegister ? "REGISTER" : "LOGIN"}`);
  const cert = shouldRegister
    ? UserServerChannel.createRegistrationCertificate()
    : UserServerChannel.createConnectionCertificate();

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
