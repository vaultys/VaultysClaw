import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * POST /api/user/request/[token]
 * Handles one round of the VaultysID Challenger protocol.
 *
 * The [token] is the sha256("vaultys-{key}-server") registration token —
 * this matches the id that BrowserChannel sends to.
 *
 * Body: raw base64 text (CryptoChannel-encrypted challenger certificate bytes)
 * Response: raw base64 text (CryptoChannel-encrypted server certificate bytes)
 */
/**
 * @openapi
 * /api/user/request/{token}:
 *   post:
 *     summary: Handle a round of the VaultysID Challenger protocol.
 *     tags: [User]
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         description: The sha256 registration token.
 *         schema:
 *           type: string
 *     requestBody:
 *       description: Raw base64 text of CryptoChannel-encrypted challenger certificate bytes.
 *       required: true
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *     responses:
 *       200:
 *         description: Raw base64 text of CryptoChannel-encrypted server certificate bytes.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const data = await request.text();

  const responseBuffer = await UserServerChannel.handleRequest(token, data);
  return new Response(Buffer.from(responseBuffer).toString("base64"), {
    headers: { "content-type": "text/plain" },
  });
}
