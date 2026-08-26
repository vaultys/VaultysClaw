import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // package.json points main/exports at dist/, which is gitignored and not
      // built in CI — alias to source so tests run from source (CI parity).
      "@vaultysclaw/shared": resolve(__dirname, "../shared/src/index.ts"),
      "@vaultysclaw/policy": resolve(__dirname, "../policy/src/index.ts"),
    },
  },
  test: { globals: true, environment: "node" },
});
