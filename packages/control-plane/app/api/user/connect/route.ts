import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { UserDAO } from "@/db";

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
  const hasUsers = (await UserDAO.list({ page: 1, pageSize: 1 })).total > 0;
  const shouldRegister = isRegister || !hasUsers;

  const cert = shouldRegister
    ? await UserServerChannel.createRegistrationCertificate()
    : await UserServerChannel.createConnectionCertificate();

  return NextResponse.json({ key: cert.key, token: cert.connection });
}
