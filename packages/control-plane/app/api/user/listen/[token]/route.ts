import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/user/listen/[token]
 * Poll the status of a connection/registration certificate.
 * [token] is the connection token (sha256("connecting-{key}-vaultys")).
 *
 * Returns { status: number }
 *   -1 = pending
 *    2 = success
 *   -2 = failed
 */
/**
 * @openapi
 * /api/user/listen/{token}:
 *   get:
 *     summary: Poll the status of a connection/registration certificate.
 *     tags: [User]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         description: The connection token (sha256("connecting-{key}-vaultys")).
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Connection status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   description: Status of the connection.
 *                   enum: [-1, 2, -2]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const cert = await UserServerChannel.listen(token);
  if (!cert) return NextResponse.json({ status: -1 });
  return NextResponse.json({ status: cert.status });
}
