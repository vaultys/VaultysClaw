/**
 * TUI launcher — renders the ink dashboard then starts the agent.
 */
import React from "react";
import { render } from "ink";
import { loadConfig } from "./config";
import { Agent } from "./agent";
import { Dashboard } from "./tui/Dashboard";

const config = loadConfig();
const agent = new Agent(config);

const { unmount } = render(React.createElement(Dashboard, { agent }));

agent.start().catch((err: Error) => {
  unmount();
  console.error("Failed to start agent:", err);
  process.exit(1);
});

const shutdown = () => {
  agent.stop();
  unmount();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
