/**
 * Entry point. Currently starts only the WebSocket server + DB bootstrap —
 * no Next.js HTTP serving yet, since no admin pages exist to serve
 * (packages/controlplane/CLAUDE.md tracks what's built vs. deferred).
 *
 * Runs on a different default port than packages/control-plane's WS server
 * (8080) so the two can run side by side during the rebuild.
 */
import { WebSocketServer } from "ws";
import pino from "pino";
import { ServerIdentityDAO, WorkspaceDAO } from "./db";
import { ControlPlaneWSServer } from "./lib/ws-server";

const logger = pino({ name: "controlplane" });

const WS_PORT = process.env.CONTROLPLANE_WS_PORT
  ? parseInt(process.env.CONTROLPLANE_WS_PORT, 10)
  : 8081;

async function main() {
  await ServerIdentityDAO.ensureServerIdentity();
  const workspace = await WorkspaceDAO.ensureDefault();
  logger.info({ workspace: workspace.slug }, "Default workspace ready");

  const wss = new WebSocketServer({ port: WS_PORT });
  new ControlPlaneWSServer(wss);

  logger.info({ port: WS_PORT }, "Control plane WebSocket server listening");
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
