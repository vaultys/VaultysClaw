import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { withError } from "@/lib/api/handlers/with-error";

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
export const GET = withError(async (_request: NextRequest, { params }: Params) => {
  const { token } = await params;
  const cert = await UserServerChannel.listen(token);
  if (!cert) {
    console.log(`[listen] token=${token} → cert NOT FOUND`);
    return NextResponse.json({ status: -1 });
  }
  console.log(`[listen] token=${token} → cert.id=${cert.id} cert.status=${cert.status}`);
  return NextResponse.json({ status: cert.status });
});
