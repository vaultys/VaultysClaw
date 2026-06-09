import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { withError } from "@/lib/api/handlers/with-error";

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * POST /api/user/bastion/listen/[token]
 * Poll whether the bastion connection has been authenticated by the user's wallet.
 * [token] is the connection token.
 *
 * Returns { status: number, browserDid?: string }
 *   status 2 + browserDid → success, browser device DID known
 */
/**
 * @openapi
 * /api/user/bastion/listen/{token}:
 *   post:
 *     summary: Poll bastion connection authentication status.
 *     tags: [User]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         description: The connection token.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response with status and optional browser device DID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: integer
 *                   description: Status code indicating the result.
 *                 browserDid:
 *                   type: string
 *                   description: Browser device DID if known.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const POST = withError(async (_request: NextRequest, { params }: Params) => {
  const { token } = await params;
  const result = await UserServerChannel.listenBastion(token);
  if (!result) return NextResponse.json({ status: -1 });
  return NextResponse.json(result);
});
