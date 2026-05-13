/**
 * Custom Next.js server that runs both HTTP and WebSocket servers
 */

// Load .env, .env.local, .env.development, etc. before anything reads process.env
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import "./lib/webrtc-polyfill";
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import pino from "pino";
import { initializeWSServer, initializeAdminWS } from "./lib/ws-server";
import { getDb, closeDb, initServerIdentity } from "./lib/db";

const logger = pino();

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const wsPort = parseInt(process.env.WS_PORT || "8080", 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Initialize SQLite database (creates tables)
  logger.info("Initializing database");
  getDb();

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

  // Initialize WebSocket server for agents (separate port)
  logger.info({ wsPort }, "Initializing WebSocket server for agents");
  const wsServer = initializeWSServer(wsPort);

  // Initialize admin WebSocket on the HTTP server (path: /ws/admin)
  initializeAdminWS(server);
  logger.info("Admin WebSocket ready on /ws/admin");

  // Start servers
  server.listen(port, (err?: Error) => {
    if (err) throw err;
    logger.info(
      { port, hostname },
      "Next.js HTTP server started"
    );
    logger.info(
      { wsPort },
      "WebSocket server ready for agent connections"
    );
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    server.close(() => {
      logger.info("HTTP server closed");
    });
    wsServer.shutdown();
    closeDb();
  });
});
