/**
 * Vitest config for UI component tests.
 * Uses jsdom environment + React Testing Library.
 */
import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["__tests__/ui/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/ui/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    globals: true,
  },
  resolve: {
    alias: {
      // Agent-controller web-app aliases
      "@webapp": resolve("packages/agent-controller/web-app/src"),
      // Control-plane aliases (Next.js @ paths)
      "@": resolve("packages/control-plane"),
      "@vaultysclaw/shared": resolve("packages/shared/src/index.ts"),
      // Force next/link and next/navigation to resolve from the control-plane package
      "next/link": resolve("packages/control-plane/node_modules/next/link.js"),
      "next/navigation": resolve(
        "packages/control-plane/node_modules/next/navigation.js"
      ),
    },
  },
});
