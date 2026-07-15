import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { adminContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * GET /api/admin/agents/:did/claude-models
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
const handlers = createNextRoute(adminContract.agents, {
  claudeModels: async ({ params, query }) => {
    const { did } = params;

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    try {
      const models = await wsServer.getClaudeModels(did, query.apiKey);
      return { status: 200, body: { models } };
    } catch (err) {
      throw new APIException(
        "UNAVAILABLE",
        err instanceof Error ? err.message : "Failed to fetch Claude models"
      );
    }
  },
});

export const GET = handlers.GET!;
