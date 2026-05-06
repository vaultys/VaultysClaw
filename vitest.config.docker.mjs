import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/docker.test.ts"],
    testTimeout: 120_000,
    // 11 minutes: first run pulls the base image and installs packages
    hookTimeout: 660_000,
    environment: "node",
    globals: true,
    reporters: ["verbose"],
    // Run in a forked process so it doesn't share state with unit/integration tests
    pool: "forks",
  },
});
