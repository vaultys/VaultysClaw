import { NextResponse } from "next/server";

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
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
