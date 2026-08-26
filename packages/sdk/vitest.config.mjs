import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Both packages resolve `types` from src/ but `import` from dist/, which is gitignored and
      // not built before tests run — a runtime value import would silently hit stale output.
      "@vaultysclaw/policy": resolve(__dirname, "../policy/src/index.ts"),
      "@vaultysclaw/trust": resolve(__dirname, "../trust/src/index.ts"),
    },
  },
  test: { globals: true, environment: "node", include: ["__tests__/**/*.test.ts"] },
});
