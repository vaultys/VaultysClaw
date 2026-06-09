import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { withError } from "@/lib/api/handlers/with-error";
import {
  unauthorized,
  forbidden,
  malformed,
  unavailable,
} from "@/lib/api/utils/api-utils";

/**
 * POST /api/registrations/batch
 * Reject multiple pending registrations at once. Global admin only.
 * Body: { ids: string[], reason?: string }
 */
/**
 * @openapi
 * /api/registrations/batch:
 *   post:
 *     summary: Reject multiple pending registrations at once.
 *     tags: [Registrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               reason:
 *                 type: string
 *             required:
 *               - ids
 *     responses:
 *       200:
 *         description: Registrations processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rejected:
 *                   type: array
 *                   items:
 *                     type: string
 *                 notFound:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to process batch rejection.
 */
export const POST = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const reason: string = body.reason ?? "Rejected by admin";

  if (ids.length === 0) {
    return malformed("No ids provided");
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not available");
  }

  const results = await Promise.all(
    ids.map(async (id) => {
      const ok = await wsServer.rejectRegistration(id, reason);
      return { id, ok };
    })
  );

  const rejected = results.filter((r) => r.ok).map((r) => r.id);
  const notFound = results.filter((r) => !r.ok).map((r) => r.id);

  return NextResponse.json({ rejected, notFound });
});
