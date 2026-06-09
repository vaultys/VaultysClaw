import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { malformed } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * POST /api/user/bastion/associate
 * Links a completed browser-device certificate with a completed user certificate,
 * confirming that the user who authenticated via QR also owns the browser device.
 *
 * Body: { userToken: string, browserToken: string }
 *   - userToken: raw key from the user's connection certificate
 *   - browserToken: raw key from the browser device certificate
 *
 * Returns { ok: true } on success.
 */
/**
 * @openapi
 * /api/user/bastion/associate:
 *   post:
 *     summary: Associate a user certificate with a browser device certificate.
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userToken:
 *                 type: string
 *                 description: Raw key from the user's connection certificate.
 *               browserToken:
 *                 type: string
 *                 description: Raw key from the browser device certificate.
 *             required:
 *               - userToken
 *               - browserToken
 *     responses:
 *       200:
 *         description: Successful association.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
export const POST = withError(async (request: NextRequest) => {
  const body = await request.json();
  const { userToken, browserToken } = body as {
    userToken: string;
    browserToken: string;
  };

  if (!userToken || !browserToken) {
    return malformed("userToken and browserToken are required");
  }

  const userCert = await UserServerChannel.connecting(userToken);
  const browserCert = await UserServerChannel.connecting(browserToken);

  if (!userCert || !browserCert) {
    return malformed("Invalid tokens");
  }

  if (userCert.status !== 2 || browserCert.status !== 2) {
    return malformed("Both certificates must be completed");
  }

  return NextResponse.json({ ok: true });
});
