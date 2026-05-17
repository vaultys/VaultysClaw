import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    externalConditions: ["node"],
    alias: {
      // Control-plane path alias — mirrors tsconfig paths used in the package
      "@": resolve(__dirname, "packages/control-plane"),
      // The AI SDK is a dep of agent-controller only, not the root workspace.
      // Alias it here so tests in __tests__/ can import and mock it.
      "ai": resolve(__dirname, "packages/agent-controller/node_modules/ai"),
      // Mastra is a dep of agent-controller only — agent/tools subpaths resolve
      // transitively via packages/agent-controller/node_modules. The base alias
      // is needed so vi.mock("@mastra/core/agent") works in llm.test.ts.
      "@mastra/core/agent": resolve(__dirname, "packages/agent-controller/node_modules/@mastra/core/dist/agent/index.js"),
      // zod is a transitive dep of ai — alias so tool modules can import it
      "zod": resolve(__dirname, "node_modules/.pnpm/zod@4.3.6/node_modules/zod"),
      // Ollama provider — used by live integration tests
      "ollama-ai-provider-v2": resolve(__dirname, "packages/agent-controller/node_modules/ollama-ai-provider-v2"),
      // bun:sqlite is a Bun built-in — shim it with better-sqlite3 for Node/Vitest
      "bun:sqlite": resolve(__dirname, "packages/agent-controller/src/bun-sqlite-shim.ts"),
      // next/server uses Next.js CJS internals that vi.mock() can't intercept.
      // Alias it to a lightweight stub so route-handler tests can inspect responses.
      "next/server": resolve(__dirname, "__tests__/mocks/next-server.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    exclude: [
      // Docker E2E tests require the docker stack — run with: pnpm test:docker
      "__tests__/docker.test.ts",
      // UI component tests need jsdom + React — run with: pnpm test:components
      "__tests__/ui/**",
      // Exclude worktrees (temporary development directories)
      ".claude/**",
      "**/node_modules/**",
    ],
  },
});
