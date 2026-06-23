import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// pnpm does NOT hoist these deps to the workspace-root node_modules — they only
// exist under each package's node_modules (symlinked into the .pnpm store).
// Resolve them from the package that actually declares the dependency so the
// alias targets survive version bumps and don't assume a hoisted layout.
const requireFrom = (pkg) =>
  createRequire(resolve(__dirname, "packages", pkg, "package.json"));
const fromAgentController = requireFrom("agent-controller");
const fromControlPlane = requireFrom("control-plane");

export default defineConfig({
  resolve: {
    externalConditions: ["node"],
    alias: {
      // Control-plane path alias — mirrors tsconfig paths used in the package
      "@": resolve(__dirname, "packages/control-plane"),
      // Workspace packages consumed by name in tests/source. Their package.json
      // points main/exports at dist/, which is gitignored and not built in CI,
      // so vite would fail with "Failed to resolve entry". The `tsx` exports
      // condition only applies under the tsx dev runner, not vitest. Alias them
      // to their TS source so tests run from source (CI parity with local).
      "@vaultysclaw/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@vaultysclaw/agent-runtime": resolve(
        __dirname,
        "packages/agent-runtime/src/index.ts"
      ),
      // @msgpack/msgpack — declared by control-plane (and agent-runtime).
      "@msgpack/msgpack": fromControlPlane.resolve("@msgpack/msgpack"),
      // The AI SDK — declared by agent-controller. Alias it here so tests in
      // __tests__/ can import and mock it.
      ai: fromAgentController.resolve("ai"),
      // @inngest/test + inngest are deps of control-plane only. Alias so tests
      // in __tests__/ resolve the same instances the control-plane code uses.
      "@inngest/test": resolve(
        __dirname,
        "packages/control-plane/node_modules/@inngest/test"
      ),
      inngest: resolve(__dirname, "packages/control-plane/node_modules/inngest"),
      // Mastra — declared by agent-controller. The alias is needed so
      // vi.mock("@mastra/core/agent") works in llm.test.ts.
      "@mastra/core/agent": fromAgentController.resolve("@mastra/core/agent"),
      // Force a single zod instance across the workspace (so `instanceof`
      // checks in ts-rest / ai tool modules resolve consistently). Points at
      // the hoisted copy so it tracks whatever version pnpm resolves rather
      // than a pinned .pnpm path that breaks when the version changes.
      zod: resolve(__dirname, "node_modules/zod"),
      // Ollama provider — declared by agent-controller; used by live integration tests
      "ollama-ai-provider-v2": fromAgentController.resolve(
        "ollama-ai-provider-v2"
      ),
      // bun:sqlite is a Bun built-in — shim it with better-sqlite3 for Node/Vitest
      "bun:sqlite": resolve(
        __dirname,
        "packages/agent-controller/src/bun-sqlite-shim.ts"
      ),
      // next/server uses Next.js CJS internals that vi.mock() can't intercept.
      // Alias it to a lightweight stub so route-handler tests can inspect responses.
      "next/server": resolve(__dirname, "__tests__/mocks/next-server.ts"),
      // next/headers uses Next.js AsyncLocalStorage that requires a request context.
      // Alias it to a no-op stub so tests run outside Next.js don't throw.
      "next/headers": resolve(__dirname, "__tests__/mocks/next-headers.ts"),
      // next-auth — declared by control-plane. Alias it so vi.mock("next-auth")
      // in test files resolves to the same module that auth-utils.ts imports.
      "next-auth": fromControlPlane.resolve("next-auth"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        // Force Vite to transform these packages so that aliases (next/headers,
        // next/server) intercept their internal require() calls, and vi.mock()
        // can match their module IDs even when they live in a nested node_modules.
        inline: ["next-auth"],
      },
    },
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
