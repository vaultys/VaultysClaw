import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { UserDao } from "@/lib/user-dao";

/**
 * GET /api/user/connect
 * Creates a new certificate for the connection flow.
 * Returns the raw key (hex) so the browser can build the VaultysID QR URL.
 *
 * Query params:
 *   - register=true  → registration/claim cert (for first-time users)
 *   - register=false → login cert (default)
 */
/**
 * @openapi
 * /api/user/connect:
 *   get:
 *     summary: Creates a new certificate for the connection flow.
 *     tags: [User]
 *     parameters:
 *       - in: query
 *         name: register
 *         schema:
 *           type: boolean
 *         description: Indicates if the certificate is for registration (true) or login (false).
 *     responses:
 *       200:
 *         description: Successfully created a certificate.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                   description: The raw key in hex format.
 *                 token:
 *                   type: string
 *                   description: The connection token.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(request: NextRequest) {
  const isRegister = request.nextUrl.searchParams.get("register") === "true";
  const shouldRegister = isRegister || !UserDao.hasAnyUser();

  const cert = shouldRegister
    ? UserServerChannel.createRegistrationCertificate()
    : UserServerChannel.createConnectionCertificate();

  return NextResponse.json({ key: cert.key, token: cert.connection });
}
