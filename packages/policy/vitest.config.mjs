import { defineConfig } from "vitest/config";

// Dedicated, dependency-free test config for the policy engine. Unlike the
// repo-root vitest config, this one has NO global setup (no Docker / Postgres) —
// the policy engine is pure logic + crypto, so its tests run standalone and fast
// via `pnpm --filter @vaultysclaw/policy test`.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
