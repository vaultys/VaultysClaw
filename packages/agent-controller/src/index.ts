/**
 * VaultysClaw Agent Controller — headless launcher
 */
import path from "path";
import fs from "fs";
import { loadConfig } from "./config";
import { Agent } from "./agent";

// Ensure data directory exists and is set up
const dataDir = process.env.VAULTYS_DATA_DIR;
if (dataDir && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const agent = new Agent(loadConfig());

agent.on("log", ({ level, message, data }: { level: string; message: string; data?: unknown }) => {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (data) {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`${prefix} ${message}`, data);
  } else {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`${prefix} ${message}`);
  }
});

agent.start().catch((err) => {
  console.error("Failed to start agent:", err);
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => { agent.stop(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
