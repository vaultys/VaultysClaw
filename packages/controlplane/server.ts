/**
 * Custom Next.js server — combines HTTP (Next.js pages/API, including the
 * VaultysId QR login flow) and the WebSocket connection lifecycle for
 * Actors in one process, on separate ports, mirroring
 * packages/control-plane's server.ts pattern.
 */
import "./lib/webrtc-polyfill";
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import pino from "pino";
import { ServerIdentityDAO, WorkspaceDAO } from "./db";
import { ControlPlaneWSServer, setWSServerInstance } from "./lib/ws-server";

const logger = pino({ name: "controlplane" });

const dev = process.env.NODE_ENV !== "production";
const PORT = process.env.CONTROLPLANE_PORT ? parseInt(process.env.CONTROLPLANE_PORT, 10) : 3001;
const WS_PORT = process.env.CONTROLPLANE_WS_PORT ? parseInt(process.env.CONTROLPLANE_WS_PORT, 10) : 8081;

const app = next({ dev, port: PORT });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  await ServerIdentityDAO.ensureServerIdentity();
  const workspace = await WorkspaceDAO.ensureDefault();
  logger.info({ workspace: workspace.slug }, "Default workspace ready");

  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url!, true)).catch((err) => {
      logger.error({ err }, "Error handling HTTP request");
      res.statusCode = 500;
      res.end("internal server error");
    });
  });
  const wss = new WebSocketServer({ port: WS_PORT });
  setWSServerInstance(new ControlPlaneWSServer(wss));
  logger.info({ port: WS_PORT }, "Control plane WebSocket server listening");

  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, "HTTP server listening");
    // Plain text, not a pino line: the one thing a developer looks for in the dev terminal —
    // more so now that every git worktree runs on its own ports (scripts/worktree.mjs).
    const slot = process.env.VAULTYSCLAW_SLOT ? ` — worktree slot ${process.env.VAULTYSCLAW_SLOT}` : "";
    process.stdout.write(
      `\n  ▸ VaultysClaw control plane ready${slot}\n` +
        `    console    http://localhost:${PORT}\n` +
        `    websocket  ws://localhost:${WS_PORT}\n\n`
    );
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
