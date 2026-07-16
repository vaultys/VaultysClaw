/**
 * MCP protocol layer — tool/resource registration and dispatch. Talks to the
 * VaultysClaw agent (`McpGatewayAgent`) through its public API only, so this
 * module has no WebSocket/VaultysId concerns of its own.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AgentPeerGrant } from "@vaultysclaw/shared";
import type { McpGatewayAgent } from "./agent.js";
import { waitForConnected } from "./agent.js";
import { GatewayMetrics } from "./metrics.js";

const RunIntentSchema = z.object({
  agent_did: z.string(),
  action: z.string(),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  timeout_ms: z.number().min(1000).max(120_000).optional().default(60_000),
});

const ChatSchema = z.object({
  agent_did: z.string(),
  message: z.string(),
});

/** Max time to wait for a mid-reconnect gateway to come back before failing a tool call. */
const CONNECT_WAIT_MS = 10_000;

function agentResourceUri(did: string): string {
  return `vc://agents/${encodeURIComponent(did)}`;
}

function findGrant(catalog: AgentPeerGrant[], did: string): AgentPeerGrant | undefined {
  return catalog.find((g) => g.targetDid === did);
}

export function createMcpServer(
  getAgent: () => McpGatewayAgent | null,
  log: (...args: unknown[]) => void
): Server {
  const server = new Server(
    { name: "vaultysclaw", version: "0.0.1" },
    { capabilities: { tools: {}, resources: {} } }
  );
  const metrics = new GatewayMetrics();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vc_list_agents",
        description:
          "List VaultysClaw agents this gateway has peer grants to communicate with. " +
          "Use agent DIDs with vc_run_intent or vc_chat.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "vc_run_intent",
        description:
          "Send an action + params to a peer agent and wait for the result. " +
          "Governed by VaultysClaw policies (budget, capabilities, approvals).",
        inputSchema: {
          type: "object",
          required: ["agent_did", "action"],
          properties: {
            agent_did: { type: "string", description: "DID of the target agent" },
            action: { type: "string", description: "Capability/action to invoke" },
            params: { type: "object", description: "Key-value parameters" },
            timeout_ms: { type: "number", description: "Max wait in ms (default 60 000)" },
          },
        },
      },
      {
        name: "vc_chat",
        description: "Send a natural-language message to a peer agent and get its LLM response.",
        inputSchema: {
          type: "object",
          required: ["agent_did", "message"],
          properties: {
            agent_did: { type: "string" },
            message: { type: "string" },
          },
        },
      },
      {
        name: "vc_agent_status",
        description:
          "Report this gateway's own connection status: agent DID, connection state, " +
          "capabilities, and how many peer agents it can reach.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "vc_gateway_metrics",
        description:
          "Report call counts, error counts, and latency (p50/p95) per tool since the " +
          "gateway process started.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const agent = getAgent();
    const catalog = agent?.getPeerCatalog() ?? [];
    return {
      resources: catalog.map((g) => ({
        uri: agentResourceUri(g.targetDid),
        name: g.targetName,
        description: g.skillDescription,
        mimeType: "application/json",
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const agent = getAgent();
    const catalog = agent?.getPeerCatalog() ?? [];
    const uri = new URL(req.params.uri);
    const did = decodeURIComponent(uri.pathname.replace(/^\//, ""));
    const grant = findGrant(catalog, did);
    if (!grant) throw new Error(`No peer grant for agent DID: ${did}`);
    return {
      contents: [
        {
          uri: req.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              did: grant.targetDid,
              name: grant.targetName,
              description: grant.skillDescription,
              capabilities: grant.capabilities,
            },
            null,
            2
          ),
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    const startedAt = Date.now();
    let ok = true;

    try {
      const agent = getAgent();

      // Tools that don't need an active connection to answer usefully.
      if (name === "vc_agent_status") {
        const status = agent?.getStatus() ?? "initializing";
        const catalogSize = agent?.getPeerCatalog().length ?? 0;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status,
                  did: agent?.getDid() ?? null,
                  peerAgentCount: catalogSize,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === "vc_gateway_metrics") {
        return { content: [{ type: "text", text: JSON.stringify(metrics.snapshot(), null, 2) }] };
      }

      if (!agent) {
        ok = false;
        return { content: [{ type: "text", text: "Gateway agent not initialized yet." }], isError: true };
      }

      if (agent.getStatus() !== "connected") {
        const hint =
          agent.getStatus() === "pending_approval"
            ? "The mcp-gateway agent is waiting for admin approval. Approve it, then restart Claude."
            : `Gateway is ${agent.getStatus()} — waiting up to ${CONNECT_WAIT_MS / 1000}s to reconnect...`;
        log(`[INFO] ${hint}`);
        const wait = await waitForConnected(agent, CONNECT_WAIT_MS);
        if (!wait.connected) {
          ok = false;
          return {
            content: [{ type: "text", text: `Gateway is ${wait.status} — try again in a moment.` }],
            isError: true,
          };
        }
      }

      if (name === "vc_list_agents") {
        const catalog = agent.getPeerCatalog();
        if (catalog.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `No peer agents configured.\nGateway DID: ${agent.getDid()}\n\n` +
                  `Ask a VaultysClaw admin to create peer grants from this gateway to the agents you want to access.`,
              },
            ],
          };
        }
        const lines = catalog.map((g: AgentPeerGrant) =>
          [
            `**${g.targetName}**`,
            `  DID: ${g.targetDid}`,
            `  Description: ${g.skillDescription}`,
            `  Capabilities: ${(g.capabilities as string[]).join(", ") || "(none)"}`,
          ].join("\n")
        );
        return { content: [{ type: "text", text: `${catalog.length} peer agent(s):\n\n${lines.join("\n\n")}` }] };
      }

      if (name === "vc_run_intent") {
        const args = RunIntentSchema.parse(rawArgs ?? {});
        const grant = findGrant(agent.getPeerCatalog(), args.agent_did);
        if (!grant) {
          ok = false;
          return {
            content: [{ type: "text", text: unknownAgentMessage(args.agent_did, agent.getPeerCatalog()) }],
            isError: true,
          };
        }
        const result = await Promise.race([
          agent.invokePeer(args.agent_did, args.action, args.params ?? {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${args.timeout_ms}ms`)), args.timeout_ms)
          ),
        ]);
        return {
          content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "vc_chat") {
        const args = ChatSchema.parse(rawArgs ?? {});
        const grant = findGrant(agent.getPeerCatalog(), args.agent_did);
        if (!grant) {
          ok = false;
          return {
            content: [{ type: "text", text: unknownAgentMessage(args.agent_did, agent.getPeerCatalog()) }],
            isError: true,
          };
        }
        const result = await agent.invokePeer(args.agent_did, "text_generation", { prompt: args.message });
        const text = typeof result === "string" ? result : (result as any)?.text ?? JSON.stringify(result, null, 2);
        return { content: [{ type: "text", text: text || "(empty response)" }] };
      }

      ok = false;
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    } catch (err) {
      ok = false;
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    } finally {
      const durationMs = Date.now() - startedAt;
      metrics.record(name, durationMs, ok);
      log(
        JSON.stringify({
          event: "tool_call",
          tool: name,
          ok,
          durationMs,
        })
      );
    }
  });

  return server;
}

function unknownAgentMessage(did: string, catalog: AgentPeerGrant[]): string {
  const known = catalog.map((g) => `${g.targetDid} (${g.targetName})`);
  return (
    `No peer grant for agent DID "${did}".\n` +
    (known.length > 0
      ? `Known agents:\n${known.map((k) => `  - ${k}`).join("\n")}`
      : "This gateway has no peer grants at all — ask an admin to configure one.")
  );
}
