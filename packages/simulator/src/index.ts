/**
 * Fleet simulator entry point.
 *
 * `run` is the interesting one: it brings up thousands of real Actors, optionally has the "admin"
 * approve them mid-flight, and then holds the fleet up so it generates the traffic a real estate
 * generates — heartbeats, certificate status refreshes, sensor telemetry, and reconnects.
 */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseConfig, type SimConfig } from "./config.js";
import { Fleet } from "./fleet.js";
import { Metrics } from "./metrics.js";
import { AGENT_MIX, ESTATE_MIX, expandMix, type SimKind } from "./personas.js";
import {
  approveSimulatedRegistrations,
  assignOwnership,
  readStats,
  resetSimulated,
  upsertPeople,
  disconnect,
} from "./db.js";
import { loadPeople, type SimHuman } from "./people.js";
import { mintAdmin } from "./admin.js";

/** Every simulated Actor's name starts with its kind, so the DB helpers can scope to them alone. */
const NAME_PREFIXES = ["openclaw-", "mcp-", "sensor-", "device-", "proxy-"];

async function main(): Promise<void> {
  const cfg = parseConfig(process.argv.slice(2));

  switch (cfg.command) {
    case "stats":
      return void (await showStats(cfg));
    case "approve":
      return void (await approve(cfg));
    case "reset":
      return void (await reset(cfg));
    case "admin":
      return void (await admin(cfg));
    case "people":
      return void (await people(cfg));
    case "run":
      return void (await run(cfg));
  }
}

async function showStats(cfg: SimConfig): Promise<void> {
  const s = await readStats(cfg.databaseUrl);
  const kinds = Object.entries(s.actorsByKind)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `      ${k.padEnd(10)} ${n}`)
    .join("\n");
  process.stdout.write(
    [
      "",
      `  actors                 ${s.actors}`,
      kinds,
      `  simulated people       ${s.people}`,
      `  owned actors           ${s.owned} across ${s.owners} owner(s)`,
      `  pending approval       ${s.pending}`,
      `  approved, undelivered  ${s.approvedUndelivered}`,
      `  active certificates    ${s.activeCerts}`,
      `  revoked certificates   ${s.revokedCerts}`,
      `  status checks recorded ${s.statusChecks}`,
      `  custom capabilities    ${s.customCapabilities}`,
      "",
    ].join("\n")
  );
  await disconnect();
}

async function approve(cfg: SimConfig): Promise<void> {
  const result = await approveSimulatedRegistrations(cfg.databaseUrl, NAME_PREFIXES);
  const byKind = Object.entries(result.byKind)
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");
  process.stdout.write(`approved ${result.approved} pending registration(s)  ${byKind}\n`);
  process.stdout.write(
    result.approved > 0
      ? "Certificates are minted on the Actor's next connection, over a live exchange — rerun `run` to collect them.\n"
      : "Nothing pending. Run the fleet first.\n"
  );
  // Approving is the moment the Actor rows come into existence, so it is also the moment there is
  // something to own. Doing it here as well as in `run` means the two-terminal flow
  // (`run` then `approve`) ends up with the same graph the one-shot `--auto-approve` flow does.
  await populate(cfg);
  await disconnect();
}

/** `simulator people` — build the population and (re)draw the ownership edges, nothing else. */
async function people(cfg: SimConfig): Promise<void> {
  if (cfg.humans === 0) {
    process.stdout.write("--humans is 0, so there is no population to build.\n");
    return;
  }
  await populate(cfg);
  await disconnect();
}

/**
 * Mint the people, then point the fleet at them.
 *
 * Silently does nothing without a `DATABASE_URL`: `run` against a control plane you only reach over
 * the wire is a legitimate way to use this — it was the only way before approval existed here — and
 * ownership is an admin-side fact, like approval. Better to run the fleet and say so than to refuse
 * to start.
 */
async function populate(cfg: SimConfig): Promise<SimHuman[]> {
  if (cfg.humans === 0) return [];
  if (!cfg.databaseUrl) {
    process.stdout.write(
      "  no DATABASE_URL — skipping the human population; the fleet will run unowned.\n"
    );
    return [];
  }

  const roster = await loadPeople(cfg.dataDir, cfg.humans, (done, total) =>
    progress("  minting identities", done, total)
  );
  const { created, granted } = await upsertPeople(cfg.databaseUrl, roster, (done, total) =>
    progress("  writing people   ", done, total)
  );
  const owned = await assignOwnership(cfg.databaseUrl, NAME_PREFIXES, roster);

  process.stdout.write(
    `\r  people          ${roster.length} (${created} new, ${granted} granted portal_access)` +
      "".padEnd(20) +
      "\n" +
      `  ownership       ${owned.assigned} assigned, ${owned.unchanged} already correct, ` +
      `${owned.ownerless} ownerless by kind\n` +
      `                  ${owned.owners} owner(s), busiest holds ${owned.busiest}\n`
  );
  return roster;
}

/** A single rewritten line on a TTY, a periodic one everywhere else — same rule as the fleet
 *  display, and for the same reason: `\r` into a pipe makes one unreadable mega-line. */
function progress(label: string, done: number, total: number): void {
  if (process.stdout.isTTY === true) process.stdout.write(`\r${label} ${done}/${total}`);
  else if (done === total) process.stdout.write(`${label} ${done}/${total}\n`);
}

async function reset(cfg: SimConfig): Promise<void> {
  const { actors, people, registrations } = await resetSimulated(cfg.databaseUrl, NAME_PREFIXES);
  let identities = 0;
  if (fs.existsSync(cfg.dataDir)) {
    identities = fs.readdirSync(cfg.dataDir).length;
    fs.rmSync(cfg.dataDir, { recursive: true, force: true });
  }
  process.stdout.write(
    `removed ${actors} actor(s), ${people} simulated human(s), ${registrations} pending ` +
      `registration(s), ${identities} local identit(ies)\n` +
      "Certificates and status checks cascaded with their Actors.\n"
  );
  await disconnect();
}

/**
 * Mint an admin human and write its VaultysID out as an encrypted backup.
 *
 * The file goes to disk rather than to stdout on purpose: it contains a private key, and a key
 * pasted through a terminal ends up in scrollback and shell history.
 */
async function admin(cfg: SimConfig): Promise<void> {
  if (!cfg.adminPassphrase) {
    process.stderr.write(
      "\n  --passphrase is required: the backup file holds a private key and is always encrypted.\n" +
        "  e.g. pnpm simulator admin --passphrase 'correct horse battery staple'\n\n"
    );
    process.exit(1);
  }

  const result = await mintAdmin({
    databaseUrl: cfg.databaseUrl,
    name: cfg.adminName,
    email: cfg.adminEmail,
    passphrase: cfg.adminPassphrase,
  });

  const outPath = cfg.adminOut ?? path.join(cfg.dataDir, result.suggestedFilename);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // 0600: it is a private key, and the default umask would leave it group/world readable.
  fs.writeFileSync(outPath, JSON.stringify(result.backup, null, 2), { mode: 0o600 });

  const snippetPath = `${outPath}.load-in-browser.js`;
  fs.writeFileSync(snippetPath, `${result.browserSnippet}\n`, { mode: 0o600 });

  process.stdout.write(
    [
      "",
      `  admin actor   ${result.name}`,
      `  did           ${result.did}`,
      "  capabilities  admin_console_access, portal_access (standing, no expiry)",
      `  backup        ${outPath}`,
      "",
      "  Fastest way in — paste this into the browser console on the control plane's origin,",
      "  then reload /login and click \"Sign in with a VaultysID in this browser\":",
      "",
      `    ${result.browserSnippet}`,
      "",
      `  (also saved to ${snippetPath})`,
      "",
      "  The encrypted backup file is the same key, for the console's own restore UI",
      "  (Identity → Browser keys). That UI only appears once advanced identity management is on,",
      "  which the snippet above enables for you.",
      "",
      "  This key exists only in those two files. Lose them and the Actor is unreachable — mint another.",
      "",
    ].join("\n")
  );

  await disconnect();
}

/**
 * Fail fast, and legibly, when nothing is listening.
 *
 * The control plane runs in its own terminal (`pnpm simulator:up`), so the ordinary mistake is to
 * start a fleet without it. Every Actor then fails to connect independently and the run becomes
 * thousands of identical `ECONNREFUSED`s scrolling past — which reads like the simulator is broken
 * rather than like nothing is there to connect to. One probe up front turns that into one sentence.
 */
async function assertControlPlaneReachable(wsUrl: string): Promise<void> {
  const { host, port } = parseWsTarget(wsUrl);

  const reachable = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(3000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });

  if (reachable) return;

  process.stderr.write(
    [
      "",
      `  Nothing is listening on ${host}:${port} — the control plane is not running.`,
      "",
      "  Start it in another terminal, then run this again:",
      "",
      "    pnpm simulator:up",
      "",
      "  (that brings up the database, applies migrations, builds, and starts the control plane;",
      "   it stays in the foreground, which is why it wants its own terminal.)",
      "",
    ].join("\n")
  );
  process.exit(1);
}

/** Host and port from a `ws://`/`wss://` URL, defaulting the port the way the schemes do. */
function parseWsTarget(wsUrl: string): { host: string; port: number } {
  const url = new URL(wsUrl);
  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : url.protocol === "wss:" ? 443 : 80,
  };
}

async function run(cfg: SimConfig): Promise<void> {
  await assertControlPlaneReachable(cfg.wsUrl);

  const kinds: SimKind[] = [
    ...expandMix(ESTATE_MIX, cfg.actors),
    ...expandMix(AGENT_MIX, cfg.agents),
  ];
  const total = kinds.length;

  const composition = countBy(kinds)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");

  process.stdout.write(
    [
      "",
      `  control plane   ${cfg.wsUrl}`,
      `  fleet           ${total} actors — ${composition}`,
      `  people          ${cfg.humans === 0 ? "none (--humans 0)" : `${cfg.humans} owning the fleet`}`,
      `  ramp            ${cfg.ratePerSecond}/s, ≤${cfg.maxInFlight} handshakes in flight`,
      `  identities      ${cfg.dataDir} (reused across runs)`,
      `  duration        ${cfg.durationSeconds === 0 ? "until Ctrl-C" : cfg.durationSeconds + "s after ramp"}`,
      "",
    ].join("\n")
  );

  // Before the ramp, not during it: minting a thousand identities is a few seconds of CPU, and
  // doing it while the fleet is handshaking would show up in the latency numbers the run exists to
  // measure. On a rerun this also re-draws ownership for the fleet already in the database, so a
  // `run` with no `--auto-approve` still ends with a populated graph.
  const roster = await populate(cfg);

  const metrics = new Metrics();
  const fleet = new Fleet(cfg, metrics);

  // A TTY gets a single line rewritten in place; anything else (a pipe, a log file, CI) gets
  // periodic newline-terminated lines. Writing \r into a pipe produces one unreadable mega-line,
  // which is exactly what a captured simulator run is for.
  const isTty = process.stdout.isTTY === true;
  const render = setInterval(
    () => {
      if (isTty) {
        process.stdout.write(`\r${metrics.renderLine(total).padEnd(160).slice(0, 160)}`);
      } else {
        process.stdout.write(`${metrics.renderLine(total)}\n`);
      }
    },
    isTty ? 500 : 5000
  );
  render.unref?.();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(render);
    if (isTty) process.stdout.write("\n");
    fleet.stop();
    process.stdout.write(metrics.renderReport(total));
    await disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await fleet.spawnAll(kinds);

  if (cfg.autoApprove) {
    // Approve *after* the ramp: every Actor has registered by now, so one pass catches the whole
    // fleet. Doing it before would approve nothing, and doing it per-actor would serialise the run.
    process.stdout.write("\n  ramp complete — approving pending registrations…\n");
    const result = await approveSimulatedRegistrations(cfg.databaseUrl, NAME_PREFIXES);
    if (cfg.reconnectAfterApprove) {
      // Only members still awaiting approval are cycled, at a rate the control plane can absorb.
      // Cycling the whole fleet produced a second handshake storm on top of the ramp's tail and
      // timed out thousands of connections.
      const cycled = fleet.reconnectPending();
      process.stdout.write(
        `  approved ${result.approved}; reconnecting ${cycled} awaiting-approval actor(s) ` +
          `at ${cfg.reconnectRatePerSecond}/s to collect grants…\n`
      );
    } else {
      // No reconnect needed: the control plane sweeps for approved-but-undelivered grants and
      // delivers them over the existing connection (`sweepUndeliveredGrants`). Reconnecting was
      // only ever a way to trigger that, and it cost a second handshake storm to do it.
      process.stdout.write(
        `  approved ${result.approved}; the control plane will deliver over the existing ` +
          `connections — no reconnect needed.\n`
      );
    }

    // Approval is what creates the Actor rows, so on a first run there was nothing to own when
    // `populate` ran. Re-running the assignment here is what gives a fresh database an ownership
    // graph in one command; on a rerun it finds everything already correct and writes nothing.
    if (roster.length > 0) {
      const owned = await assignOwnership(cfg.databaseUrl, NAME_PREFIXES, roster);
      process.stdout.write(
        `  ownership: ${owned.assigned} newly assigned across ${owned.owners} owner(s)\n`
      );
    }
  }

  if (cfg.durationSeconds > 0) {
    await sleep(cfg.durationSeconds * 1000);
    await shutdown();
  }
}

function countBy(kinds: SimKind[]): [SimKind, number][] {
  const m = new Map<SimKind, number>();
  for (const k of kinds) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  process.stderr.write(`\nsimulator: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
