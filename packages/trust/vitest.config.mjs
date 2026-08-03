import { defineConfig } from "vitest/config";

// Dedicated, dependency-free test config for the trust engine. Like
// packages/policy, this has NO global setup (no Docker / Postgres) — the
// engine is pure logic over already-verified certificate data, so its tests
// run standalone and fast via `pnpm --filter @vaultysclaw/trust test`.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
