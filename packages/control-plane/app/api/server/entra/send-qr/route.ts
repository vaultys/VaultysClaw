import { NextResponse } from "next/server";
import { withError } from "@/lib/api/handlers/with-error";

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
export const POST = withError(async () => {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
});
