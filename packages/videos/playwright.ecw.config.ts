import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";
import { parseEnv, REPO } from "./stack";

// Local secrets (ELEVENLABS_API_KEY), never committed: packages/videos/.env.
const local = path.join(__dirname, ".env");
if (fs.existsSync(local)) for (const [k, v] of Object.entries(parseEnv(local))) process.env[k] ??= v;

/**
 * The ECW demonstrator's video (`ecw-demo/`). Not the console, so not the video stack: the
 * demonstrator only runs against the simulator's isolated stack (`pnpm simulator:up`), which it
 * refuses to leave (`assertDemoTarget`). Hence its own config — no setup fleet, no filmed admin —
 * with the demonstrator itself as the web server.
 */
export default defineConfig({
  testDir: "./ecw-demo",
  reporter: "list",
  workers: 1,
  fullyParallel: false,
  timeout: 8 * 60 * 1000,
  use: { baseURL: "http://localhost:3012" },
  projects: [
    {
      name: "ecw",
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // The fleet view is a three.js scene: SwiftShader, Chromium's software WebGL, draws it at
        // about 11 fps, which films as a slideshow. On the Mac's GPU it runs at 60.
        launchOptions: { args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] },
      },
    },
  ],
  webServer: {
    command: "pnpm demo:ecw",
    cwd: REPO,
    url: "http://localhost:3012/state",
    timeout: 120 * 1000,
    reuseExistingServer: true,
  },
});
