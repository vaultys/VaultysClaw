import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { getLiteLLMServiceState } from "@/lib/litellm-service";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * GET /api/settings/litellm/status
 *
 * Lightweight status check — reads in-memory service state only.
 * No external calls, no DB round-trips. Safe to poll from the sidebar.
 */
/**
 * @openapi
 * /api/settings/litellm/status:
 *   get:
 *     summary: Check the status of the LiteLLM service.
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Service status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["unconfigured", "connecting", "connected", "error"]
 *                 configured:
 *                   type: boolean
 *                 baseUrl:
 *                   type: string
 *                 lastError:
 *                   type: string
 *                   nullable: true
 *                 checkedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export const GET = withError(async (req: NextRequest) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const state = getLiteLLMServiceState();
  return NextResponse.json({
    status: state.status, // "unconfigured" | "connecting" | "connected" | "error"
    configured: state.status !== "unconfigured",
    baseUrl: state.baseUrl,
    lastError: state.lastError,
    checkedAt: state.checkedAt,
  });
});
