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
/**
 * @openapi
 * /api/user/p2p/connect:
 *   get:
 *     summary: Opens a server-side PeerJS channel for user connection.
 *     tags: [User]
 *     responses:
 *       200:
 *         description: Connection details for PeerJS channel.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connectionString:
 *                   type: string
 *                   description: PeerJS vaultys://peerjs?... URI embedded in QR.
 *                 token:
 *                   type: string
 *                   description: Connection token (sha256 hash).
 *                 key:
 *                   type: string
 *                   description: Raw cert key for next-auth signIn.
 *                 serverDid:
 *                   type: string
 *                   nullable: true
 *                   description: Server VaultysID DID appended to the QR URL.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
