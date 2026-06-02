/**
 * Custom Next.js server that runs both HTTP and WebSocket servers
 *
 * Data directory structure:
 *   <data-dir>/
 *   ├── vaultysclaw.db
 *   ├── .env
 *   ├── .env.local
 *   ├── .vaultys/server.id
 *   └── workspace/
 */

import "./lib/webrtc-polyfill";
import { createServer } from "node:http";
import { parse } from "node:url";
import path from "path";
import fs from "fs";
import next from "next";
import pino from "pino";
import dotenv from "dotenv";
import { initializeWSServer, initializeAdminWS } from "./lib/ws-server";
import { initializePeerjsServer, AgentPeerjsServer } from "./lib/peerjs-server";
import { getSetting } from "./lib/db";
import { getDb, closeDb, initServerIdentity, getFileStorage } from "./lib/db";
import {
  startWorkflowScheduler,
  stopWorkflowScheduler,
} from "./lib/workflow-scheduler";

const logger = pino();

// Parse --data-dir from CLI args (must be done before loadEnvConfig)
function getDataDir(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--data-dir" || args[i] === "-d") && args[i + 1]) {
      return path.resolve(args[i + 1]);
    }
  }
  return path.resolve(process.cwd(), "data");
}

const dataDir = getDataDir();

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load .env files from the data directory
const envFiles = [".env", ".env.local", ".env.development"];
for (const envFile of envFiles) {
  const envPath = path.join(dataDir, envFile);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Expose paths via env so db.ts and other modules resolve them lazily (at call time, not import time).
process.env.VAULTYS_DB_PATH = path.join(dataDir, "vaultysclaw.db");
process.env.VAULTYS_ID_PATH = path.join(dataDir, ".vaultys", "server.id");
process.env.VAULTYS_WORKSPACE_ROOT = path.join(dataDir, "workspace");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const wsPort = parseInt(process.env.WS_PORT || "8080", 10);
const peerjsEnabledEnv = process.env.PEERJS_ENABLED === "true";
const peerjsServerUrlEnv = process.env.PEERJS_SERVER_URL || undefined;

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Initialize SQLite database (creates tables)
  logger.info("Initializing database");
  getDb();

  // Warm up file storage (reads + decrypts config from DB)
  await getFileStorage();
  logger.info("File storage initialized");

  // Generate server VaultysId if not present
  await initServerIdentity();
  logger.info("Server identity ready");

  // Create HTTP server for Next.js
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error(err, "Error handling request");
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Start workflow scheduler (fires cron-scheduled workflows)
  startWorkflowScheduler();

  // Initialize WebSocket server for agents (separate port)
  logger.info({ wsPort }, "Initializing WebSocket server for agents");
  const wsServer = initializeWSServer(wsPort);

  // Initialize PeerJS/WebRTC server — enabled by env var or DB setting.
  const peerjsEnabledDb = getSetting("peerjs_enabled") === "true";
  const peerjsEnabled = peerjsEnabledEnv || peerjsEnabledDb;
  const peerjsServerUrl =
    peerjsServerUrlEnv ?? (getSetting("peerjs_server_url") || undefined);
  if (peerjsEnabled) {
    const peerjsServer = initializePeerjsServer(wsServer, peerjsServerUrl);
    peerjsServer
      .start()
      .then((peerId) => {
        logger.info(
          { peerId, serverUrl: peerjsServerUrl },
          "PeerJS server ready — agents can connect with: --peerjs " + peerId
        );
      })
      .catch((err) => {
        logger.error({ err }, "Failed to start PeerJS server");
      });
  } else {
    // Initialize the singleton without starting — allows API routes to start it later.
    initializePeerjsServer(wsServer, peerjsServerUrl);
    const peerId = AgentPeerjsServer.getServerPeerId();
    if (peerId) {
      logger.info(
        { peerId },
        "PeerJS transport disabled. Enable from the Network admin page or set PEERJS_ENABLED=true."
      );
    }
  }

  // Initialize admin WebSocket on the HTTP server (path: /ws/admin)
  initializeAdminWS(server);
  logger.info("Admin WebSocket ready on /ws/admin");

  // Start servers
  server.listen(port, (err?: Error) => {
    if (err) throw err;
    logger.info({ port, hostname }, "Next.js HTTP server started");
    logger.info({ wsPort }, "WebSocket server ready for agent connections");
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    server.close(() => {
      logger.info("HTTP server closed");
    });
    wsServer.shutdown();
    stopWorkflowScheduler();
    closeDb();
  });
});
