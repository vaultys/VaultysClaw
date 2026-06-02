/**
 * TUI launcher — renders the ink dashboard then starts the agent.
 */
import React from "react";
import { render } from "ink";
import { loadConfig } from "./config";
import { Agent } from "./agent";
import { Dashboard } from "./tui/Dashboard";

// ── Process-level crash guards ────────────────────────────────────────────────
process.on("uncaughtException", (err: Error) => {
  const ts = new Date().toISOString();
  console.error(
    `[${ts}] [ERROR] Uncaught exception — agent will continue:`,
    err
  );
});

process.on("unhandledRejection", (reason: unknown) => {
  const ts = new Date().toISOString();
  console.error(
    `[${ts}] [ERROR] Unhandled promise rejection — agent will continue:`,
    reason
  );
});
// ─────────────────────────────────────────────────────────────────────────────

const config = loadConfig();
const agent = new Agent(config);

const { unmount } = render(React.createElement(Dashboard, { agent }));

agent.start().catch((err: Error) => {
  unmount();
  console.error("Failed to start agent:", err);
  process.exit(1);
});

// Keep-alive — same reasoning as index.ts: prevents silent exit when PeerJS
// reconnect drains the event loop. Cleared explicitly on shutdown.
const keepAlive = setInterval(() => {
  /* event-loop anchor */
}, 30_000);

const shutdown = () => {
  clearInterval(keepAlive);
  agent.stop();
  unmount();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
