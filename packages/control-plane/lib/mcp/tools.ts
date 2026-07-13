import { AgentDAO, IntentDAO } from "@/db";
import { getWSServer } from "@/lib/ws-server";
import type { AuthContext } from "@/lib/auth-utils";

/**
 * Tools exposed by the /api/mcp endpoint. Unlike packages/mcp-gateway (a
 * separate VaultysId-identified agent), these tools run inside the control
 * plane process and are scoped directly by the caller's AuthContext — either
 * a NextAuth session or an API key. API-key callers act without a VaultysId,
 * so intents they send carry no userDid and are attributed only to the key
 * (see AuthContext.did === "apikey:<id>"); this trades per-agent delegation
 * audit trails for simple bearer-token access.
 */

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "vc_list_agents",
    description:
      "List VaultysClaw agents visible to the caller (scoped by workspace access).",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Filter by name substring" },
        online: { type: "boolean", description: "Only return online agents" },
      },
    },
  },
  {
    name: "vc_run_intent",
    description:
      "Send an action + params to an agent and wait for the result. " +
      "Governed by the caller's workspace access; times out after 25s if the agent doesn't respond.",
    inputSchema: {
      type: "object",
      required: ["agentDid", "action"],
      properties: {
        agentDid: { type: "string", description: "DID of the target agent" },
        action: { type: "string", description: "Capability/action to invoke" },
        params: { type: "object", description: "Key-value parameters" },
      },
    },
  },
];

async function listAgents(
  auth: AuthContext,
  args: { search?: string; online?: boolean }
) {
  const wsServer = getWSServer();
  const connectedDids = new Set(
    wsServer?.getConnectedAgents().map((a) => a.id) ?? []
  );

  const { agents } = await AgentDAO.query({
    search: args.search,
    page: 1,
    pageSize: 100,
    workspaceIds: auth.isGlobalAdmin ? undefined : auth.workspaceIds,
    onlineFilter: args.online,
    onlineDids: connectedDids,
  });

  return {
    agents: agents.map((a) => ({
      did: a.did,
      name: a.name,
      online: connectedDids.has(a.did),
      capabilities: a.capabilities,
    })),
  };
}

async function runIntent(
  auth: AuthContext,
  args: { agentDid: string; action: string; params?: Record<string, unknown> }
) {
  const { agentDid, action, params = {} } = args;
  if (!agentDid || !action) {
    throw new Error("agentDid and action are required");
  }
  if (!(await auth.canAccessAgent(agentDid))) {
    throw new Error("Not permitted to access this agent");
  }

  const wsServer = getWSServer();
  if (!wsServer) throw new Error("WebSocket server not initialized");

  const intentId = `mcp-intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // API-key callers have no VaultysId — the intent is attributed to the key only.
  const userDid = auth.did.startsWith("apikey:") ? undefined : auth.did;

  const sent = await wsServer.sendIntentToAgent(
    agentDid,
    intentId,
    action,
    params,
    userDid
  );
  if (!sent) throw new Error("Agent not found or not connected");

  const timeoutMs = 25_000;
  const pollIntervalMs = 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const row = await IntentDAO.findById(intentId);
    if (row && row.status !== "pending") {
      return {
        intentId,
        status: row.status,
        output: row.output ?? null,
        error: row.error ?? null,
      };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return {
    intentId,
    status: "pending",
    output: null,
    error: "Timed out waiting for agent response after 25s",
  };
}

export async function callMcpTool(
  auth: AuthContext,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "vc_list_agents":
      return listAgents(auth, args as { search?: string; online?: boolean });
    case "vc_run_intent":
      return runIntent(
        auth,
        args as { agentDid: string; action: string; params?: Record<string, unknown> }
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
