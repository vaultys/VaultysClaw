import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Source, not dist: these packages resolve `types` from src/ but `import` from a gitignored
      // dist/, so a runtime value import would silently hit stale output.
      "@vaultysclaw/policy": resolve(__dirname, "../policy/src/index.ts"),
      "@vaultysclaw/trust": resolve(__dirname, "../trust/src/index.ts"),
      "@vaultysclaw/sdk": resolve(__dirname, "../sdk/src/index.ts"),
    },
  },
  test: { globals: true, environment: "node", include: ["__tests__/**/*.test.ts"] },
});
