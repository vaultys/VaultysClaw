/**
 * Custom Next.js server that runs both HTTP and WebSocket servers
 */

import "./lib/env-preload";
import { initOTel } from "./lib/otel";
initOTel();
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
import { initializeLiteLLMService } from "./lib/litellm-service";
import { prisma, SettingsDAO } from "./db";
import { ServerIdentityDAO } from "./db/settings.dao";
import { getFileStorage } from "./lib/file-storage-manager";
import { OrgSkillDAO } from "./db";
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


const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const wsPort = parseInt(process.env.WS_PORT || "8080", 10);
const peerjsEnabledEnv = process.env.PEERJS_ENABLED === "true";
const peerjsServerUrlEnv = process.env.PEERJS_SERVER_URL || undefined;

async function seedDefaults(): Promise<void> {
  const workspaceCount = await prisma.workspace.count();
  if (workspaceCount === 0) {
    await prisma.workspace.create({
      data: {
        id: crypto.randomUUID(),
        name: "Default",
        slug: "default",
        description: "The default workspace",
        color: "#6366f1",
        isDefault: true,
      },
    });
  }

  const builtInSkills = [
    {
      name: "social-media",
      description: "Post content to X (Twitter) via Playwright browser automation.",
      version: "1.0.0",
      icon: "📣",
      content: "## Social Media\n\nYou have access to X (Twitter) social-media tools.",
    },
    {
      name: "web-scraper",
      description: "Scrape web pages and extract their text content.",
      version: "1.0.0",
      icon: "🌐",
      content: "## Web Scraper\n\nYou can scrape public web pages using the `scrape_page` tool.",
    },
    {
      name: "json-api",
      description: "Make authenticated or anonymous JSON API calls to external HTTP endpoints.",
      version: "1.0.0",
      icon: "🔌",
      content: "## JSON API\n\nYou can call external HTTP APIs using the `api_call_json` tool.",
    },
    {
      name: "calculator",
      description: "Evaluate arithmetic and algebraic expressions.",
      version: "1.0.0",
      icon: "🧮",
      content: "## Calculator\n\nYou can evaluate math expressions using the `calculate` tool.",
    },
  ];

  for (const skill of builtInSkills) {
    await OrgSkillDAO.upsertBuiltIn(skill);
  }
}

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Connect to PostgreSQL
  logger.info("Connecting to database");
  await prisma.$connect();

  // Seed defaults (workspace, built-in skills)
  await seedDefaults();
  logger.info("Database ready");

  // Warm up file storage (reads + decrypts config from DB)
  await getFileStorage();
  logger.info("File storage initialized");

  // Generate server VaultysId if not present
  await ServerIdentityDAO.ensureServerIdentity();
  logger.info("Server identity ready");

  // Initialize LiteLLM service — loads DB config (env vars as fallback).
  // Fully non-blocking: never prevents the server from starting.
  initializeLiteLLMService();

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

  // Initialize PeerJS/WebRTC server
  const peerjsEnabledDb = (await SettingsDAO.get("peerjs_enabled")) === "true";
  const peerjsEnabled = peerjsEnabledEnv || peerjsEnabledDb;
  const peerjsServerUrl = peerjsServerUrlEnv ?? ((await SettingsDAO.get("peerjs_server_url")) || undefined);
  if (peerjsEnabled) {
    const peerjsServer = initializePeerjsServer(wsServer, peerjsServerUrl);
    peerjsServer
      .start()
      .then((peerId) => {
        logger.info({ peerId, serverUrl: peerjsServerUrl }, "PeerJS server ready");
      })
      .catch((err) => {
        logger.error({ err }, "Failed to start PeerJS server");
      });
  } else {
    initializePeerjsServer(wsServer, peerjsServerUrl);
    const peerId = await AgentPeerjsServer.getServerPeerId();
    if (peerId) {
      logger.info({ peerId }, "PeerJS transport disabled.");
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
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully");
    server.close(() => {
      logger.info("HTTP server closed");
    });
    wsServer.shutdown();
    stopWorkflowScheduler();
    await prisma.$disconnect();
  });
});
