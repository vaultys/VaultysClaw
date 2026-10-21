import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";
import { BASE_URL, parseEnv, REPO } from "./stack";

// Local secrets (ELEVENLABS_API_KEY), never committed: packages/videos/.env.
const local = path.join(__dirname, ".env");
if (fs.existsSync(local)) for (const [k, v] of Object.entries(parseEnv(local))) process.env[k] ??= v;

/**
 * Demo videos (CLAUDE.md): not a test suite. Each spec drives the real console on the demo-video
 * stack (docker/video.env) and renders a narrated video. `pnpm video:up` must have built it first.
 */
export default defineConfig({
  testDir: ".",
  reporter: "list",
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60 * 1000,
  globalTeardown: "./teardown.ts",
  use: { baseURL: BASE_URL },
  projects: [
    { name: "setup", testMatch: /setup\/.*\.setup\.ts/, timeout: 5 * 60 * 1000 },
    {
      name: "videos",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm video:cp",
    cwd: REPO,
    url: `${BASE_URL}/login`,
    timeout: 120 * 1000,
    reuseExistingServer: true,
  },
});
