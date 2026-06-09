import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { getLiteLLMServiceState } from "@/lib/litellm-service";

/**
 * GET /api/settings/litellm/status
 *
 * Lightweight status check — reads in-memory service state only.
 * No external calls, no DB round-trips. Safe to poll from the sidebar.
 */
export async function GET(req: NextRequest) {
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
}
