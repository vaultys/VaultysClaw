#!/usr/bin/env node
/**
 * VaultysClaw Proxy
 *
 * A governance-gated reverse proxy that connects to the control plane
 * exactly like an agent (own VaultysId, WS/PeerJS, register -> pending_approval
 * -> connected), then runs an HTTP listener that verifies and authorizes
 * traffic locally against the config the control plane pushes down.
 *
 * Environment variables:
 *   VC_CONTROL_PLANE_URL     HTTP URL of the control plane (default: http://localhost:3000)
 *   VC_CONTROL_PLANE_WS_URL  WebSocket URL (default derived from VC_CONTROL_PLANE_URL)
 *   VC_VAULTYS_ID_PATH       Path to this proxy's own VaultysId file (default: ~/.vaultysclaw/proxy.id)
 *   VC_PROXY_NAME            Display name in the dashboard (default: proxy)
 *   VC_PEERJS_CONTROL_PLANE_ID  PeerJS peer ID of the control plane — when set, connects via WebRTC instead of WebSocket
 *   VC_PEERJS_SERVER_URL     Custom PeerJS signaling server URL (optional)
 *   PROXY_HTTP_PORT          Port the reverse-proxy listener binds to (default: 8090)
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { LocalDb } from "./local-db.js";
import { ProxyRuntime } from "./proxy-runtime.js";
import { startHttpServer } from "./http-server.js";

const log = (...args: unknown[]) =>
  process.stderr.write(`[vaultysclaw-proxy] ${args.join(" ")}\n`);

function buildConfig() {
  const controlPlaneUrl = process.env.VC_CONTROL_PLANE_URL ?? "http://localhost:3000";

  let controlPlaneWsUrl = process.env.VC_CONTROL_PLANE_WS_URL;
  if (!controlPlaneWsUrl) {
    const url = new URL(controlPlaneUrl);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    controlPlaneWsUrl = `${proto}//${url.hostname}:8080`;
  }

  const vaultysIdPath =
    process.env.VC_VAULTYS_ID_PATH ?? path.join(os.homedir(), ".vaultysclaw", "proxy.id");

  const idDir = path.dirname(vaultysIdPath);
  if (!fs.existsSync(idDir)) fs.mkdirSync(idDir, { recursive: true });

  const httpPort = Number(process.env.PROXY_HTTP_PORT ?? 8090);

  return {
    name: process.env.VC_PROXY_NAME ?? "proxy",
    controlPlaneUrl,
    controlPlaneWsUrl,
    peerjsControlPlaneId: process.env.VC_PEERJS_CONTROL_PLANE_ID || undefined,
    peerjsServerUrl: process.env.VC_PEERJS_SERVER_URL || undefined,
    vaultysIdPath,
    requestedCapabilities: [] as any[],
    localDbPath: path.join(idDir, "proxy.db"),
    httpPort,
  };
}

async function main() {
  log("Starting VaultysClaw Proxy...");
  const config = buildConfig();
  log(`Identity: ${config.vaultysIdPath}`);
  log(`Control plane: ${config.controlPlaneUrl} / ${config.controlPlaneWsUrl}`);
  log(`HTTP listener: port ${config.httpPort}`);

  const localDb = new LocalDb(config.localDbPath);
  const runtime = new ProxyRuntime(config, localDb);

  runtime.on("log", ({ level, message }: { level: string; message: string }) => {
    if (level !== "debug") log(`[${level.toUpperCase()}] ${message}`);
  });

  runtime.on("status_changed", ({ status }: { status: string }) => {
    log(`Status -> ${status}`);
    if (status === "pending_approval") {
      log("Waiting for admin approval in the VaultysClaw dashboard.");
      log(`Approve the proxy named "${config.name}", then it will connect automatically.`);
    }
    if (status === "connected") {
      log(`Connected. DID: ${runtime.getDid()}`);
    }
  });

  const http = startHttpServer({ port: config.httpPort, localDb, runtime });

  const shutdown = () => {
    log("Shutting down...");
    http.stop();
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
