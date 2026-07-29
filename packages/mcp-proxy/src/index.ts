#!/usr/bin/env node
/**
 * VaultysClaw MCP Proxy
 *
 * A standalone agent (own VaultysId, WS/PeerJS, register -> pending_approval
 * -> connected) exposing the same governance-gated reverse-proxy pipeline as
 * @vaultysclaw/proxy, but over MCP instead of raw HTTP — for callers that
 * already speak MCP (Claude Code, Claude Desktop, or a customer's own
 * agent/workflow tool) instead of embedding an HTTP client.
 *
 * Extracted from @vaultysclaw/proxy into its own package (issue #46):
 * the stdio/http MCP architecture is independent enough — its own identity,
 * its own onboarding, its own lifecycle — to warrant a standalone process
 * rather than a mode of the HTTP proxy.
 *
 * Environment variables:
 *   VC_CONTROL_PLANE_URL     HTTP URL of the control plane (default: http://localhost:3000)
 *   VC_CONTROL_PLANE_WS_URL  WebSocket URL (default derived from VC_CONTROL_PLANE_URL)
 *   VC_VAULTYS_ID_PATH       Path to this agent's own VaultysId file (default: ~/.vaultysclaw/mcp-proxy.id)
 *   VC_PROXY_NAME            Display name in the dashboard (default: mcp-proxy)
 *   VC_PEERJS_CONTROL_PLANE_ID  PeerJS peer ID of the control plane — when set, connects via WebRTC instead of WebSocket
 *   VC_PEERJS_SERVER_URL     Custom PeerJS signaling server URL (optional)
 *   MCP_PROXY_MODE           "stdio" | "http" (default: stdio)
 *   MCP_PROXY_HTTP_PORT      Port for the streamable-HTTP transport when MCP_PROXY_MODE=http (default: 8091)
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { LocalDb } from "@vaultysclaw/proxy";
import { McpProxyRuntime } from "./mcp-proxy-runtime.js";
import { startMcpStdioServer, startMcpHttpServer } from "./mcp-server.js";

const log = (...args: unknown[]) =>
  process.stderr.write(`[vaultysclaw-mcp-proxy] ${args.join(" ")}\n`);

function buildConfig() {
  const controlPlaneUrl = process.env.VC_CONTROL_PLANE_URL ?? "http://localhost:3000";

  let controlPlaneWsUrl = process.env.VC_CONTROL_PLANE_WS_URL;
  if (!controlPlaneWsUrl) {
    const url = new URL(controlPlaneUrl);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    controlPlaneWsUrl = `${proto}//${url.hostname}:8080`;
  }

  const vaultysIdPath =
    process.env.VC_VAULTYS_ID_PATH ?? path.join(os.homedir(), ".vaultysclaw", "mcp-proxy.id");

  const idDir = path.dirname(vaultysIdPath);
  if (!fs.existsSync(idDir)) fs.mkdirSync(idDir, { recursive: true });

  const mode = (process.env.MCP_PROXY_MODE ?? "stdio") as "stdio" | "http";
  const httpPort = Number(process.env.MCP_PROXY_HTTP_PORT ?? 8091);

  return {
    name: process.env.VC_PROXY_NAME ?? "mcp-proxy",
    controlPlaneUrl,
    controlPlaneWsUrl,
    peerjsControlPlaneId: process.env.VC_PEERJS_CONTROL_PLANE_ID || undefined,
    peerjsServerUrl: process.env.VC_PEERJS_SERVER_URL || undefined,
    vaultysIdPath,
    requestedCapabilities: [] as any[],
    localDbPath: path.join(idDir, "mcp-proxy.db"),
    mode,
    httpPort,
  };
}

async function main() {
  log("Starting VaultysClaw MCP Proxy...");
  const config = buildConfig();
  log(`Identity: ${config.vaultysIdPath}`);
  log(`Control plane: ${config.controlPlaneUrl} / ${config.controlPlaneWsUrl}`);

  const localDb = new LocalDb(config.localDbPath);
  const runtime = new McpProxyRuntime(config, localDb);

  runtime.on("log", ({ level, message }: { level: string; message: string }) => {
    if (level !== "debug") log(`[${level.toUpperCase()}] ${message}`);
  });

  runtime.on("status_changed", ({ status }: { status: string }) => {
    log(`Status -> ${status}`);
    if (status === "pending_approval") {
      log("Waiting for admin approval in the VaultysClaw dashboard.");
      log(`Approve the agent named "${config.name}", then it will connect automatically.`);
    }
    if (status === "connected") {
      log(`Connected. DID: ${runtime.getDid()}`);
    }
  });

  let mcp: { stop: () => void } | null = null;
  if (config.mode === "stdio") {
    log("MCP transport: stdio");
    await startMcpStdioServer(localDb, runtime);
  } else {
    log(`MCP transport: streamable HTTP on port ${config.httpPort}`);
    mcp = startMcpHttpServer(config.httpPort, localDb, runtime);
  }

  const shutdown = () => {
    log("Shutting down...");
    mcp?.stop();
    localDb.close();
    runtime.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await runtime.start();
}

main().catch((err) => {
  log("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
