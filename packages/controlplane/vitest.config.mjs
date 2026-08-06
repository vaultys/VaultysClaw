import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Dedicated, dependency-free test config — like packages/policy's and
// packages/trust's, this has NO global setup: no Docker, no Postgres, no Next.js
// runtime. It covers the pure logic in `lib/` that can be tested that way
// (rule-set validation and kindConfig parsing, whose whole job is rejecting
// configuration that would silently disable enforcement on a whole fleet).
//
// Anything needing a real database stays out of here on purpose; a Docker-gated
// integration suite is still deferred, per this package's CLAUDE.md.
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's `@/*` -> `./*` path mapping, which vitest does not
    // read on its own.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
