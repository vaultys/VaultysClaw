/**
 * Vitest global setup — runs once before all test workers.
 *
 * Responsibilities:
 *  1. Apply Prisma migrations to the test database so the schema is always up to date.
 *  2. Ensure the `serverSecret` setting exists in the test DB (required by auth-handler).
 *
 * DATABASE_URL is set via `test.env` in vitest.config.mjs and therefore available
 * to every test worker. But globalSetup runs in the main process before workers
 * start, so we set it explicitly here too so the pg pool can connect.
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB_URL = "postgresql://test:test@localhost:5432/vaultysclaw_test";
const CONTROL_PLANE_DIR = resolve(__dirname, "../packages/control-plane");

export async function setup() {
  // Make the URL available to this process (used by the dynamic imports below)
  process.env.DATABASE_URL = TEST_DB_URL;

  // Apply any pending migrations to the test DB
  execSync("pnpm exec prisma migrate deploy", {
    cwd: CONTROL_PLANE_DIR,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });

  // Dynamically import after DATABASE_URL is set so the Prisma pool picks it up
  const { SettingsDAO } = await import(
    "../packages/control-plane/db/settings.dao.ts"
  );
  const { VaultysId } = await import("@vaultys/id");

  const existing = await SettingsDAO.get("serverSecret");
  if (!existing) {
    const vid = await VaultysId.generateMachine();
    const secret = (vid as any).toVersion(1).getSecret("base64");
    await SettingsDAO.set("serverSecret", secret);
  }
}
