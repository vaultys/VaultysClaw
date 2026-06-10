import { NextResponse } from "next/server";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * Health check endpoint for load balancers and deployment tools.
 * Returns 200 OK if the control plane is running.
 *
 * No authentication required - public endpoint.
 *
 * GET /api/health
 *
 * Response:
 * {
 *   "status": "ok",
 *   "timestamp": "2026-05-29T12:34:56.789Z"
 * }
 */
/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check for the control plane.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Control plane is running.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
export const GET = withError(async () => {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
});
