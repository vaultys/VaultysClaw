#!/usr/bin/env node
// Lets several git worktrees of this repo run the control plane side by side: each one gets its
// own ports, its own Docker stack (Postgres + Redis + Apprise) and its own seeded database.
//
//   node scripts/worktree.mjs                 the slot and ports of this checkout
//   node scripts/worktree.mjs exec <cmd…>     runs <cmd> with this slot's environment (see slotEnv)
//   node scripts/worktree.mjs setup           prepares a fresh worktree (Orca's `setup` hook, orca.yaml)
//   node scripts/worktree.mjs seed [--force]  (re)seeds its database: admin + a small owned fleet
//   node scripts/worktree.mjs teardown        deletes its Docker stack and data (Orca's `archive` hook)
//
// Slots. The main checkout is slot 0 and is left exactly as it always was: `exec` adds nothing to
// its environment, so the defaults written in package.json, docker-compose.controlplane.yml and
// server.ts (3001 / 8081 / pg 5433 / redis 6381 / apprise 8000) still apply. Every other worktree
// gets a slot from 1 to MAX_SLOT, stored in its own git admin directory
// (<git-common-dir>/worktrees/<name>/vaultysclaw-slot): it survives `git worktree move`, and it is
// freed when git deletes that directory with the worktree. VAULTYSCLAW_SLOT=<n> forces one.
//
// Ports. A worktree's ports live in their own range, 20000 + 10 × slot + k — not the main
// checkout's ports shifted, because VaultysHub's worktrees already shift *its* ports by +1000 from a
// 5433 Postgres, and the two repos run on the same machine. Slot 3 → http 20031, ws 20032,
// postgres 20033, redis 20034, apprise 20035.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_SLOT = 99;
const SLOT_FILE = "vaultysclaw-slot";
const COMPOSE_FILE = join(ROOT, "docker/docker-compose.controlplane.yml");
const CONTROLPLANE_ENV = join(ROOT, "packages/controlplane/.env");
/** Git-ignored. Everything the seed produces that is not in the database: the admin's key, the fleet's identities. */
const STATE_DIR = join(ROOT, ".worktree");
const SEED_MARKER = join(STATE_DIR, "seeded");
/**
 * The seeded admin's key, unencrypted. The control plane's dev-only route
 * (app/api/public/dev/worktree-admin) serves it to the "Sign in as the worktree admin" button on
 * /login — only when VAULTYSCLAW_WORKTREE_ADMIN points here and NODE_ENV is not production.
 */
const ADMIN_IDENTITY = join(STATE_DIR, "admin.identity.json");
/** The admin's backup is encrypted with this. Dev-only, printed on purpose: the database it unlocks is disposable. */
const ADMIN_PASSPHRASE = "vaultysclaw-worktree";
const ADMIN_NAME = "Worktree Admin";
/** Small enough to seed in well under a minute, big enough for every console page to have something on it. */
const SEED_FLEET = { actors: 20, agents: 40, humans: 12 };

// ── Slot ────────────────────────────────────────────────────────────────────────────────────────

function git(...args) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** { gitDir, commonDir } of this checkout, or null outside git (a Docker build, a tarball). */
function gitDirs() {
  try {
    const [gitDir, commonDir] = git("rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir").split("\n");
    return { gitDir, commonDir };
  } catch {
    return null;
  }
}

function readSlot(file) {
  try {
    const n = Number(readFileSync(file, "utf-8").trim());
    return Number.isInteger(n) && n >= 1 && n <= MAX_SLOT ? n : null;
  } catch {
    return null;
  }
}

/** The slot already recorded for this checkout (0 for the main one), or null if it has none yet. */
function currentSlot() {
  if (process.env.VAULTYSCLAW_SLOT !== undefined) {
    const n = Number(process.env.VAULTYSCLAW_SLOT);
    if (!Number.isInteger(n) || n < 0 || n > MAX_SLOT) throw new Error(`VAULTYSCLAW_SLOT must be an integer from 0 to ${MAX_SLOT}`);
    return n;
  }
  const dirs = gitDirs();
  if (!dirs || dirs.gitDir === dirs.commonDir) return 0;
  return readSlot(join(dirs.gitDir, SLOT_FILE));
}

function portInUse(port) {
  return new Promise((done) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (busy) => {
      socket.destroy();
      done(busy);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * Gives this worktree a slot if it has none: the lowest one no other worktree holds and whose ports
 * nothing is listening on. A lock directory keeps two worktrees created at once from taking the same.
 */
async function ensureSlot() {
  const existing = currentSlot();
  if (existing !== null) return existing;
  const { gitDir, commonDir } = gitDirs();
  const lock = join(commonDir, "vaultysclaw-slot.lock");
  for (let i = 0; ; i++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (i > 100) throw new Error(`${lock} is held — remove it if no setup is running`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    const used = new Set();
    const worktrees = join(commonDir, "worktrees");
    if (existsSync(worktrees))
      for (const name of readdirSync(worktrees)) {
        const n = readSlot(join(worktrees, name, SLOT_FILE));
        if (n !== null) used.add(n);
      }
    for (let slot = 1; slot <= MAX_SLOT; slot++) {
      if (used.has(slot)) continue;
      const busy = await Promise.all(Object.values(slotPorts(slot).ports).map(portInUse));
      if (busy.some(Boolean)) continue;
      writeFileSync(join(gitDir, SLOT_FILE), `${slot}\n`);
      return slot;
    }
    throw new Error(`No free slot left (${MAX_SLOT} worktrees): remove some worktrees first`);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

// ── Ports and environment ───────────────────────────────────────────────────────────────────────

function slotPorts(slot) {
  if (slot === 0)
    return { slot, project: "vaultysclaw-controlplane", ports: { http: 3001, ws: 8081, postgres: 5433, redis: 6381, apprise: 8000 } };
  const base = 20000 + slot * 10;
  return {
    slot,
    project: `vaultysclaw-controlplane-${slot}`,
    ports: { http: base + 1, ws: base + 2, postgres: base + 3, redis: base + 4, apprise: base + 5 },
  };
}

/**
 * What `exec` puts in the environment of a worktree's commands. Nothing for the main checkout.
 *
 * It has to be the process environment, not only packages/controlplane/.env: server.ts reads
 * CONTROLPLANE_PORT before Next loads any .env file, and process variables win over .env ones, so a
 * DATABASE_URL exported in your shell would otherwise point a worktree at the main database.
 */
function slotEnv(slot) {
  if (slot === 0) return {};
  const { project, ports } = slotPorts(slot);
  return {
    VAULTYSCLAW_SLOT: String(slot),
    COMPOSE_PROJECT_NAME: project, // wins over the compose file's `name:`
    PG_PORT: String(ports.postgres),
    REDIS_PORT: String(ports.redis),
    APPRISE_PORT: String(ports.apprise),
    DATABASE_URL: `postgresql://vaultys:vaultys_dev_secret@localhost:${ports.postgres}/vaultysclaw`,
    REDIS_URL: `redis://localhost:${ports.redis}`,
    APPRISE_API_URL: `http://localhost:${ports.apprise}`,
    CONTROLPLANE_PORT: String(ports.http),
    CONTROLPLANE_WS_PORT: String(ports.ws),
    NEXTAUTH_URL: `http://localhost:${ports.http}`,
    APP_URL: `http://localhost:${ports.http}`,
    CONTROLPLANE_WS_URL: `ws://localhost:${ports.ws}`,
    VAULTYSCLAW_WORKTREE_ADMIN: ADMIN_IDENTITY,
  };
}

function describe(slot) {
  const { project, ports: p } = slotPorts(slot);
  return [
    slot === 0 ? "slot 0 (main checkout — historical ports)" : `slot ${slot} (docker project ${project})`,
    `  console   http://localhost:${p.http}`,
    `  ws        ws://localhost:${p.ws}`,
    `  postgres  localhost:${p.postgres}   redis localhost:${p.redis}   apprise http://localhost:${p.apprise}`,
  ].join("\n");
}

// ── Commands ────────────────────────────────────────────────────────────────────────────────────

function step(title) {
  console.log(`\n▸ ${title}`);
}

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`\n✗ ${cmd} ${args.join(" ")} failed (exit ${r.status ?? r.signal})`);
    process.exit(r.status ?? 1);
  }
}

/** packages/controlplane/.env for this worktree: the main checkout's, with the slot's infrastructure. Never overwritten. */
function writeControlplaneEnv(slot) {
  if (existsSync(CONTROLPLANE_ENV)) {
    console.log("  kept packages/controlplane/.env (already there)");
    return;
  }
  const main = git("worktree", "list", "--porcelain").split("\n")[0].replace(/^worktree /, "");
  const mainEnv = join(main, "packages/controlplane/.env");
  const source = existsSync(mainEnv) ? mainEnv : join(ROOT, "packages/controlplane/.env.example");
  const own = slotEnv(slot);
  delete own.VAULTYSCLAW_SLOT;
  delete own.COMPOSE_PROJECT_NAME;
  delete own.PG_PORT;
  delete own.REDIS_PORT;
  delete own.APPRISE_PORT;
  delete own.CONTROLPLANE_WS_URL;
  delete own.VAULTYSCLAW_WORKTREE_ADMIN;
  // The main checkout's legacy names for the ports; server.ts reads neither.
  const dropped = new Set(["PORT", "WS_PORT"]);
  const seen = new Set();
  const lines = [];
  for (const line of readFileSync(source, "utf-8").split("\n")) {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (key && dropped.has(key)) continue;
    if (key && key in own) {
      lines.push(`${key}=${own[key]}`);
      seen.add(key);
    } else if (key === "NEXTAUTH_SECRET" && /change-me/.test(line)) {
      lines.push(`NEXTAUTH_SECRET=${randomBytes(32).toString("base64")}`);
      seen.add(key);
    } else {
      if (key) seen.add(key);
      lines.push(line);
    }
  }
  for (const [key, value] of Object.entries(own)) if (!seen.has(key)) lines.push(`${key}=${value}`);
  if (!seen.has("NEXTAUTH_SECRET")) lines.push(`NEXTAUTH_SECRET=${randomBytes(32).toString("base64")}`);
  const header = `# Written by scripts/worktree.mjs for worktree slot ${slot}, from ${source}: own ports, database, Redis and Apprise.\n`;
  writeFileSync(CONTROLPLANE_ENV, header + lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
  console.log(`  wrote packages/controlplane/.env (from ${source})`);
}

function dockerUp(slot) {
  run("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d", "--wait"], slotEnv(slot));
}

function migrate(slot) {
  run("pnpm", ["--filter", "@vaultysclaw/controlplane", "exec", "prisma", "migrate", "deploy"], slotEnv(slot));
}

async function waitForPort(port, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the control plane exited (code ${child.exitCode}) before listening`);
    if (await portInUse(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`the control plane did not listen on :${port} within ${timeoutMs / 1000}s`);
}

/**
 * Seeds this worktree's database: an admin human whose key is exported for the browser, then a
 * small simulated fleet — registered over real handshakes, approved, given certificates, and owned
 * by a dozen people. The simulator needs a live control plane for the handshakes and its server
 * identity for the admin's grant, so one is started for the duration and stopped afterwards.
 */
async function seed(slot, { force = false } = {}) {
  if (slot === 0) {
    console.error("Refusing to seed the main checkout's database (slot 0). Seed a worktree instead.");
    process.exit(1);
  }
  if (existsSync(SEED_MARKER) && !force) {
    console.log("  already seeded (.worktree/seeded) — `pnpm worktree:seed --force` to seed again");
    return;
  }
  const env = { ...slotEnv(slot), NODE_ENV: "development" };
  const { ports } = slotPorts(slot);
  if (await portInUse(ports.ws)) {
    console.error(`  :${ports.ws} is already in use — stop this worktree's control plane before seeding.`);
    process.exit(1);
  }
  mkdirSync(STATE_DIR, { recursive: true });

  step("generating the simulator's Prisma client");
  run("pnpm", ["simulator:prisma"]);

  step(`starting a temporary control plane on :${ports.http} / :${ports.ws}`);
  const log = join(STATE_DIR, "seed-controlplane.log");
  const out = openSync(log, "w");
  const cp = spawn("pnpm", ["--filter", "@vaultysclaw/controlplane", "exec", "node", "--conditions=tsx", "--import", "tsx", "server.ts"], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", out, out],
    detached: true,
  });
  const stop = () => {
    try {
      process.kill(-cp.pid, "SIGTERM");
    } catch {}
  };
  process.on("exit", stop);
  try {
    await waitForPort(ports.ws, cp, 180_000);
  } catch (err) {
    console.error(`  ${err.message} — see ${log}`);
    process.exit(1);
  }

  // pnpm --filter runs it from packages/simulator, hence the absolute paths below.
  const simulator = (args) => run("pnpm", ["--filter", "@vaultysclaw/simulator", "start", ...args], env);

  step(`minting the admin "${ADMIN_NAME}"`);
  const adminOut = join(STATE_DIR, "admin.vaultysid.json");
  simulator(["admin", "--name", ADMIN_NAME, "--passphrase", ADMIN_PASSPHRASE, "--out", adminOut, "--identity-out", ADMIN_IDENTITY, "--data-dir", join(STATE_DIR, "simdata")]);

  step(`seeding a fleet: ${SEED_FLEET.actors} estate + ${SEED_FLEET.agents} agent Actors owned by ${SEED_FLEET.humans} people`);
  simulator([
    "--actors", String(SEED_FLEET.actors),
    "--agents", String(SEED_FLEET.agents),
    "--humans", String(SEED_FLEET.humans),
    "--rate", "30",
    "--max-in-flight", "30",
    "--auto-approve",
    "--reconnect-after-approve",
    "--duration", "15",
    "--data-dir", join(STATE_DIR, "simdata"),
  ]);

  stop();
  writeFileSync(SEED_MARKER, `${new Date().toISOString()}\n`);
  console.log(`
  Seeded. Once \`pnpm dev\` is running, open http://localhost:${ports.http}/login and click
  "Sign in as the worktree admin" (${ADMIN_NAME}).
  Same key, encrypted: ${adminOut} (passphrase "${ADMIN_PASSPHRASE}").`);
}

async function setup() {
  const slot = await ensureSlot();
  console.log(`Worktree ${ROOT}\n${describe(slot)}`);

  if (slot !== 0) {
    step("packages/controlplane/.env");
    writeControlplaneEnv(slot);
  }
  step("pnpm install");
  run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
  step("building the workspace packages the control plane imports");
  run("pnpm", ["exec", "turbo", "run", "build", "--filter=@vaultysclaw/policy", "--filter=@vaultysclaw/shared", "--filter=@vaultysclaw/trust"]);

  if (slot === 0) {
    console.log("\nMain checkout: dependencies ready; its database is yours, so no Docker stack or seed here.");
    return;
  }
  step(`docker stack ${slotPorts(slot).project}`);
  dockerUp(slot);
  step("prisma migrate deploy");
  migrate(slot);
  step("seed");
  await seed(slot);
  console.log(`\nReady. \`pnpm dev\` → http://localhost:${slotPorts(slot).ports.http}`);
}

function teardown() {
  const slot = currentSlot();
  if (slot === null) return console.log("This worktree never got a slot: nothing to tear down.");
  if (slot === 0) {
    console.error("Refusing to tear down the main checkout's stack (slot 0).");
    process.exit(1);
  }
  console.log(`Removing docker project ${slotPorts(slot).project} and its volumes…`);
  run("docker", ["compose", "-f", COMPOSE_FILE, "down", "-v", "--remove-orphans"], slotEnv(slot));
  rmSync(SEED_MARKER, { force: true });
}

function exec(args) {
  if (args.length === 0) {
    console.error("usage: node scripts/worktree.mjs exec <command> [args…]");
    process.exit(2);
  }
  const slot = currentSlot();
  if (slot === null) {
    console.error("This worktree has no slot yet — run `pnpm worktree:setup` first, or it would use the main checkout's ports and database.");
    process.exit(1);
  }
  const child = spawn(args[0], args.slice(1), { stdio: "inherit", env: { ...process.env, ...slotEnv(slot) } });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case undefined:
  case "ports": {
    const slot = currentSlot();
    console.log(slot === null ? "No slot yet — `pnpm worktree:setup` assigns one." : describe(slot));
    break;
  }
  case "exec":
    exec(rest);
    break;
  case "setup":
    await setup();
    break;
  case "seed": {
    const slot = currentSlot();
    if (slot === null) throw new Error("No slot yet — run `pnpm worktree:setup` first.");
    await seed(slot, { force: rest.includes("--force") });
    break;
  }
  case "teardown":
    teardown();
    break;
  default:
    console.error(`unknown command ${command} — ports | exec | setup | seed | teardown`);
    process.exit(2);
}
