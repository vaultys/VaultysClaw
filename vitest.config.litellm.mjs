import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/litellm-docker.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 660_000,
    environment: "node",
    globals: true,
    reporters: ["verbose"],
    pool: "forks",
  },
});
