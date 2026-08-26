import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dedicated, dependency-free test config for the trust engine. Like
// packages/policy, this has NO global setup (no Docker / Postgres) — the
// engine is pure logic over already-verified certificate data, so its tests
// run standalone and fast via `pnpm --filter @vaultysclaw/trust test`.
export default defineConfig({
  resolve: {
    alias: {
      // @vaultysclaw/policy's package.json resolves `types` from src/ but
      // `import` from dist/, which is gitignored and not built before tests run.
      // A type-only import therefore works while a runtime value import silently
      // resolves to stale (or missing) dist output. Alias to source so both come
      // from the same place, and CI matches local.
      "@vaultysclaw/policy": resolve(__dirname, "../policy/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
