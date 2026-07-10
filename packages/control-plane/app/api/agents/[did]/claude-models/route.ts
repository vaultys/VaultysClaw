import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * GET /api/agents/:did/claude-models
 *
 * Asks the connected agent (over the existing WS control channel) for the
 * list of Claude models available to it, via the Claude Agent SDK's
 * `supportedModels()`. Used by the control-plane UI to populate the model
 * picker for the `claude-agent-sdk` provider instead of a free-text input.
 *
 * There is no persisted registry for this — it's a live, best-effort query
 * against the agent's own connection (and its configured/candidate API
 * key), so failures (agent offline, bad key, SDK error) are expected and
 * surfaced as a normal error response; callers should fall back to a
 * static model list.
 */
export const GET = withError(
  async (request: NextRequest, ctx: { params: Promise<{ did: string }> }) => {
    const { did } = await ctx.params;
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin && !(await auth.canAccessAgent(did)))
      throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const apiKey = request.nextUrl.searchParams.get("apiKey") ?? undefined;

    try {
      const models = await wsServer.getClaudeModels(did, apiKey);
      return NextResponse.json({ models });
    } catch (err) {
      throw new APIException(
        "UNAVAILABLE",
        err instanceof Error ? err.message : "Failed to fetch Claude models"
      );
    }
  }
);
