#!/usr/bin/env node
/**
 * VaultysClaw MCP Gateway
 *
 * A proper VaultysClaw agent (VaultysId identity, WebSocket auth, policies
 * distributed by the control plane) that exposes peer agents as MCP tools.
 *
 * Environment variables:
 *   VC_CONTROL_PLANE_URL     HTTP URL of the control plane (default: http://localhost:3000)
 *   VC_CONTROL_PLANE_WS_URL  WebSocket URL (default: ws://localhost:8080)
 *   VC_VAULTYS_ID_PATH       Path to VaultysId file (default: ~/.vaultysclaw/mcp-gateway.id)
 *   VC_AGENT_NAME            Display name in dashboard (default: mcp-gateway)
 *   VC_PEERJS_CONTROL_PLANE_ID  PeerJS peer ID of the control plane — when set,
 *                               connects via WebRTC instead of WebSocket
 *   VC_PEERJS_SERVER_URL     Custom PeerJS signaling server URL (optional)
 *
 * Internal env var set on spawned `claude -p` subprocesses to prevent the
 * subprocess from starting another gateway connection back to the control plane:
 *   VC_GATEWAY_BYPASS=1
 */

// ── Bypass guard ─────────────────────────────────────────────────────────────
// When `claude -p` is spawned by this gateway, it will try to start this MCP
// server again. Detect that and exit immediately so it doesn't create a second
// agent connection to the control plane.
if (process.env.VC_GATEWAY_BYPASS === "1") process.exit(0);

// Pure/side-effect-free — safe to import before the stdout guard below.
// (ESM import bindings are available before this module's own top-level code
// runs regardless of where the `import` statement appears in the file, but
// it's declared here, ahead of the guard that uses it, for readability.)
import { isJsonRpcMessage } from "./jsonrpc-guard.js";

// ── Stdout guard — must run before any library import ────────────────────────
// Pino uses sonic-boom which writes via fs.write(fd) and bypasses this guard,
// so all pino loggers in agent-runtime must be created with process.stderr as
// their destination. This guard is a second layer for any library that does go
// through process.stdout.write.
{
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = function (
    chunk: string | Uint8Array,
    encoding?: any,
    callback?: any
  ): boolean {
    const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    // Only let valid MCP JSON-RPC 2.0 messages through; redirect everything else
    // to stderr. A real JSON.parse (rather than a substring check) avoids both
    // false positives — e.g. a log line that happens to embed the text
    // `"jsonrpc":"2.0"` while describing a message, which would otherwise leak
    // onto stdout and corrupt the protocol stream — and false negatives from
    // whitespace/formatting variations.
    if (isJsonRpcMessage(s)) {
      return orig(chunk, encoding, callback);
    }
    return process.stderr.write(chunk, encoding, callback);
  };
}

import "./polyfill.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildAgentConfig, McpGatewayAgent, type RequestSampling } from "./agent.js";
import { createMcpServer } from "./mcp-server.js";

const log = (...args: unknown[]) => process.stderr.write(`[vaultysclaw-mcp] ${args.join(" ")}\n`);

async function main() {
  log("Starting VaultysClaw MCP Gateway...");

  let agent: McpGatewayAgent | null = null;
  const server = createMcpServer(() => agent, log);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server ready. Connecting to control plane...");

  const config = buildAgentConfig();
  log(`Identity: ${config.vaultysIdPath}`);
  if (config.peerjsControlPlaneId) {
    log(`Control plane: ${config.controlPlaneUrl} (WebRTC peer=${config.peerjsControlPlaneId})`);
  } else {
    log(`Control plane: ${config.controlPlaneUrl} / ${config.controlPlaneWsUrl} (WebSocket)`);
  }

  // ── MCP sampling — ask Claude Desktop to do the LLM call with its own auth ──
  //
  // The MCP `sampling/createMessage` request lets a server delegate LLM inference
  // to the host client (Claude Desktop).  No subprocess, no credential management.
  // Claude Desktop will use the same model and auth as the current session.
  const requestSampling: RequestSampling = async (messages, maxTokens) => {
    const result = await server.request(
      {
        method: "sampling/createMessage",
        params: {
          messages: messages.map((m) => ({ role: m.role, content: { type: "text" as const, text: m.content } })),
          maxTokens,
        },
      },
      CreateMessageResultSchema
    );
    if (result.content.type !== "text") return { text: "(non-text response)" };
    return { text: result.content.text, model: result.model, stopReason: result.stopReason };
  };

  agent = new McpGatewayAgent(config, requestSampling, log);

  agent.on("log", ({ level, message }: { level: string; message: string }) => {
    if (level !== "debug") log(`[${level.toUpperCase()}] ${message}`);
  });

  agent.on("status_changed", ({ status }: { status: string }) => {
    log(`Status → ${status}`);
    if (status === "pending_approval") {
      log("⚠  Waiting for admin approval in the VaultysClaw dashboard.");
      log(`   Approve the agent named "${config.name}", then restart Claude.`);
    }
    if (status === "connected") {
      log(`Connected. DID: ${agent!.getDid()}`);
    }
  });

  await agent.start();
}

main().catch((err) => {
  log("Fatal:", err);
  process.exit(1);
});
