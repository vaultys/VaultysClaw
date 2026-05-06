/**
 * VaultysClaw Agent Controller — headless launcher
 */
import { loadConfig } from "./config";
import { Agent } from "./agent";

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
