import { defineConfig } from "vitest/config";

// E2E tests against the LIVE dev stack (control plane + agent + LM Studio).
// See __tests__/reasoning-e2e.test.ts for prerequisites.
export default defineConfig({
  test: {
    include: ["__tests__/reasoning-e2e.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    environment: "node",
    globals: true,
    reporters: ["verbose"],
    pool: "forks",
    // Live-stack tests: run sequentially, one chat at a time
    maxConcurrency: 1,
    fileParallelism: false,
  },
});
