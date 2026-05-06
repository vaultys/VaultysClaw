/**
 * Web mode launcher — starts the agent + HTTP/SSE dashboard server.
 */
import { loadConfig } from "./config";
import { Agent } from "./agent";
import { startWebServer } from "./web/server";

const config = loadConfig();
const agent = new Agent(config);

const port = parseInt(process.env.WEB_PORT ?? "3002", 10);
const noBrowser = process.env.WEB_NO_BROWSER === "1";

// Start web server before agent so the dashboard is immediately reachable
const server = startWebServer({ port, agent });

// Log to console as well (web mode users still have a terminal)
agent.on("log", ({ level, message }: { level: string; message: string }) => {
  const prefix = `[${new Date().toISOString().slice(11, 23)}] [${level.toUpperCase()}]`;
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`${prefix} ${message}`);
});

agent.start().then(async () => {
  if (!noBrowser) {
    const url = `http://127.0.0.1:${port}`;
    // Use dynamic import for 'open' so it doesn't break when bundled without it
    try {
      const { default: open } = await import("open");
      await open(url);
    } catch {
      // 'open' not available — user can open manually
    }
  }
}).catch((err) => {
  console.error("Failed to start agent:", err);
  process.exit(1);
});

const shutdown = () => {
  agent.stop();
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
