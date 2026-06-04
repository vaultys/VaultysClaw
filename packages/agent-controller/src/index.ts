/**
 * VaultysClaw Agent Controller — headless launcher
 *
 * Used directly by system-service installs (launchd / systemd / schtasks).
 * When running via the CLI (`agent-controller --mode headless`), the agent
 * runs inline inside cli.ts instead — no fork, no tsx signal propagation.
 */
import fs from "fs";
import { loadConfig } from "./config";
import { Agent } from "./agent";

// ── Process-level crash guards ────────────────────────────────────────────────
process.on("uncaughtException", (err: Error) => {
  console.error(
    `[${new Date().toISOString()}] [ERROR] Uncaught exception — continuing:`,
    err
  );
});
process.on("unhandledRejection", (reason: unknown) => {
  console.error(
    `[${new Date().toISOString()}] [ERROR] Unhandled rejection — continuing:`,
    reason
  );
});
for (const sig of ["SIGHUP", "SIGPIPE"] as NodeJS.Signals[]) {
  try {
    process.on(sig, () => {});
  } catch {
    /* platform may not support */
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Ensure data directory exists
const dataDir = process.env.VAULTYS_DATA_DIR;
if (dataDir && !fs.existsSync(dataDir))
  fs.mkdirSync(dataDir, { recursive: true });

const agent = new Agent(loadConfig());

agent.on(
  "log",
  ({
    level,
    message,
    data,
  }: {
    level: string;
    message: string;
    data?: unknown;
  }) => {
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
    if (data) {
      console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
        `${prefix} ${message}`,
        data
      );
    } else {
      console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
        `${prefix} ${message}`
      );
    }
  }
);

agent.start().catch((err) => {
  console.error("Failed to start agent:", err);
  process.exit(1);
});

// Keep the event loop alive so reconnect timers never find an empty loop.
const keepAlive = setInterval(() => {
  /* event-loop anchor */
}, 30_000);

const shutdown = (sig: string) => () => {
  console.log(
    `[${new Date().toISOString()}] [INFO] Received ${sig} — shutting down`
  );
  clearInterval(keepAlive);
  agent.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown("SIGINT"));
process.on("SIGTERM", shutdown("SIGTERM"));
