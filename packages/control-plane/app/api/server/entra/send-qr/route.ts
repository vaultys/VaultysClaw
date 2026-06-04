import { NextResponse } from "next/server";

/**
 * POST /api/server/entra/send-qr - Send QR code to Entra ID user
 */
/**
 * @openapi
 * /api/server/entra/send-qr:
 *   post:
 *     summary: Send QR code to Entra ID user.
 *     tags: [Server]
 *     responses:
 *       501:
 *         description: Not implemented.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
