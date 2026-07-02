import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { adminAgentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const DEFAULT_TIMEOUT_MS = 60_000;

const handlers = createNextRoute(adminAgentsContract, {
  runIntent: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    const agentDid = params.did;

    if (!(await auth.canAccessAgent(agentDid))) throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer) throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const intentId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = body.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const result = await new Promise<{
      intentId: string;
      status: "success" | "failed";
      output: unknown;
      error: string | null;
      executedAt: string;
    }>((resolve, reject) => {
      const unsubscribe = wsServer.registerResultCallback(intentId, (payload) => {
        resolve({
          intentId,
          status: payload.status ?? "failed",
          output: payload.output ?? null,
          error: payload.error ?? null,
          executedAt: payload.executedAt ?? new Date().toISOString(),
        });
      });

      const timer = setTimeout(() => {
        unsubscribe();
        reject(new APIException("UNAVAILABLE", `Agent did not respond within ${timeoutMs}ms`));
      }, timeoutMs);

      wsServer
        .sendIntentToAgent(agentDid, intentId, body.action, body.params ?? {}, auth.did)
        .then((sent) => {
          if (!sent) {
            clearTimeout(timer);
            unsubscribe();
            reject(new APIException("UNAVAILABLE", "Agent not connected"));
          }
        })
        .catch((err) => {
          clearTimeout(timer);
          unsubscribe();
          reject(err);
        });
    });

    return { status: 200, body: result };
  },
});

export const POST = handlers.POST!;
