import { defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

// mcp-gateway unit tests are pure (no DB/WebSocket), so they run without the
// Postgres-container global setup the default config requires.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "__tests__/mcp-gateway-server.test.ts",
      "__tests__/peer-manager-incoming-auth.test.ts",
      "__tests__/mcp-gateway-jsonrpc-guard.test.ts",
    ],
  },
});
