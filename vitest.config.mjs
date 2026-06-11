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
      // @msgpack/msgpack is a dep of both packages but not hoisted to root
      "@msgpack/msgpack": resolve(
        __dirname,
        "node_modules/.pnpm/@msgpack+msgpack@3.1.3/node_modules/@msgpack/msgpack"
      ),
      // The AI SDK is a dep of agent-controller only, not the root workspace.
      // Alias it here so tests in __tests__/ can import and mock it.
      ai: resolve(__dirname, "packages/agent-controller/node_modules/ai"),
      // Mastra is a dep of agent-controller only — agent/tools subpaths resolve
      // transitively via packages/agent-controller/node_modules. The base alias
      // is needed so vi.mock("@mastra/core/agent") works in llm.test.ts.
      "@mastra/core/agent": resolve(
        __dirname,
        "packages/agent-controller/node_modules/@mastra/core/dist/agent/index.js"
      ),
      // Force a single zod instance across the workspace (so `instanceof`
      // checks in ts-rest / ai tool modules resolve consistently). Points at
      // the hoisted copy so it tracks whatever version pnpm resolves rather
      // than a pinned .pnpm path that breaks when the version changes.
      zod: resolve(__dirname, "node_modules/zod"),
      // Ollama provider — used by live integration tests
      "ollama-ai-provider-v2": resolve(
        __dirname,
        "packages/agent-controller/node_modules/ollama-ai-provider-v2"
      ),
      // bun:sqlite is a Bun built-in — shim it with better-sqlite3 for Node/Vitest
      "bun:sqlite": resolve(
        __dirname,
        "packages/agent-controller/src/bun-sqlite-shim.ts"
      ),
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
    // Allow up to 30 s for the Docker container to be stopped in teardown.
    teardownTimeout: 30000,
    globalSetup: ["__tests__/global-setup.ts"],
    // DATABASE_URL is NOT set here — global-setup.ts sets process.env.DATABASE_URL
    // before workers are spawned so they inherit it automatically.  A static value
    // here would override the dynamic URL chosen by the setup.
    exclude: [
      // Docker E2E tests require the docker stack — run with: pnpm test:docker / test:litellm
      "__tests__/docker.test.ts",
      "__tests__/litellm-docker.test.ts",
      // UI component tests need jsdom + React — run with: pnpm test:components
      "__tests__/ui/**",
      // Exclude worktrees (temporary development directories)
      ".claude/**",
      "**/node_modules/**",
    ],
  },
});
