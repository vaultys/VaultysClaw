/**
 * Vitest global setup — runs once in the main process before any test workers start.
 *
 * Lifecycle:
 *  setup()    — spins up an ephemeral Docker Postgres container, applies Prisma
 *               migrations, and seeds the required `serverSecret` setting.
 *  teardown() — stops and removes the container unconditionally.
 *
 * DATABASE_URL is set on process.env here so that workers spawned afterwards
 * inherit it.  It is intentionally NOT listed in vitest.config.mjs `test.env` so
 * there is a single source of truth for the URL.
 */

import { execSync, spawnSync } from "child_process";
import * as net from "net";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTROL_PLANE_DIR = resolve(__dirname, "../packages/control-plane");

// ── Container config ──────────────────────────────────────────────────────────

const CONTAINER_NAME = "vaultysclaw-test-pg";
const PG_PORT = 5499;
const PG_USER = "test";
const PG_PASS = "test";
const PG_DB = "vaultysclaw_test";

export const TEST_DB_URL =
  `postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the TCP port is accepting connections. */
function isTcpOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost" });
    socket.setTimeout(500);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error",   () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

/** Asks Postgres inside the container if it is ready to accept connections. */
function pgIsReady(): boolean {
  const r = spawnSync(
    "docker",
    ["exec", CONTAINER_NAME, "pg_isready", "-U", PG_USER, "-d", PG_DB],
    { stdio: "pipe" }
  );
  return r.status === 0;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Polls until Postgres is up or the timeout elapses. */
async function waitForPostgres(maxMs = 60_000): Promise<void> {
  const deadline = Date.now() + maxMs;

  // First wait for the TCP port to open (container networking coming up).
  while (!(await isTcpOpen(PG_PORT))) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for port ${PG_PORT} to open (${maxMs}ms)`
      );
    }
    await sleep(250);
  }

  // Then wait for Postgres itself to be ready to accept queries.
  while (!pgIsReady()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for pg_isready in container (${maxMs}ms)`
      );
    }
    await sleep(250);
  }
}

/** Remove the test container if it exists, ignoring errors. */
function removeContainer(): void {
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "pipe" });
}

// ── Exported lifecycle ────────────────────────────────────────────────────────

export async function setup() {
  console.log(
    `[global-setup] Starting Postgres container "${CONTAINER_NAME}" on port ${PG_PORT}…`
  );

  // Kill any leftover container from a previous run.
  removeContainer();

  // Start a fresh, isolated Postgres container.
  // --rm is omitted intentionally: we want teardown() to control removal so the
  // container stays inspectable if the process is killed mid-run.
  execSync(
    [
      "docker run -d",
      `--name ${CONTAINER_NAME}`,
      `-p ${PG_PORT}:5432`,
      `-e POSTGRES_USER=${PG_USER}`,
      `-e POSTGRES_PASSWORD=${PG_PASS}`,
      `-e POSTGRES_DB=${PG_DB}`,
      // Disable fsync/full_page_writes for speed — fine for throwaway containers.
      "postgres:16-alpine -c fsync=off -c full_page_writes=off",
    ].join(" "),
    { stdio: "pipe" }
  );

  // Wait until Postgres is accepting connections.
  await waitForPostgres();
  console.log("[global-setup] Postgres ready.");

  // Make the URL available to this process so Prisma picks it up on import.
  process.env.DATABASE_URL = TEST_DB_URL;

  // Apply all pending migrations.
  console.log("[global-setup] Running Prisma migrations…");
  execSync("pnpm exec prisma migrate deploy", {
    cwd: CONTROL_PLANE_DIR,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
  console.log("[global-setup] Migrations applied.");

  // Seed the required serverSecret setting (auth-handler needs it on every request).
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

  console.log("[global-setup] Setup complete.");
}

export async function teardown() {
  console.log(`[global-setup] Removing container "${CONTAINER_NAME}"…`);
  removeContainer();
  console.log("[global-setup] Container removed.");
}
