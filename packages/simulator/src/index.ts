/**
 * Fleet simulator entry point.
 *
 * `run` is the interesting one: it brings up thousands of real Actors, optionally has the "admin"
 * approve them mid-flight, and then holds the fleet up so it generates the traffic a real estate
 * generates — heartbeats, certificate status refreshes, sensor telemetry, and reconnects.
 */

import fs from "node:fs";
import { parseConfig, type SimConfig } from "./config.js";
import { Fleet } from "./fleet.js";
import { Metrics } from "./metrics.js";
import { AGENT_MIX, ESTATE_MIX, expandMix, type SimKind } from "./personas.js";
import { approveSimulatedRegistrations, readStats, resetSimulated, disconnect } from "./db.js";

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
  await disconnect();
}

async function reset(cfg: SimConfig): Promise<void> {
  const { actors, registrations } = await resetSimulated(cfg.databaseUrl, NAME_PREFIXES);
  let identities = 0;
  if (fs.existsSync(cfg.dataDir)) {
    identities = fs.readdirSync(cfg.dataDir).length;
    fs.rmSync(cfg.dataDir, { recursive: true, force: true });
  }
  process.stdout.write(
    `removed ${actors} actor(s), ${registrations} pending registration(s), ${identities} local identit(ies)\n` +
      "Certificates and status checks cascaded with their Actors.\n"
  );
  await disconnect();
}

async function run(cfg: SimConfig): Promise<void> {
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
      `  ramp            ${cfg.ratePerSecond}/s, ≤${cfg.maxInFlight} handshakes in flight`,
      `  identities      ${cfg.dataDir} (reused across runs)`,
      `  duration        ${cfg.durationSeconds === 0 ? "until Ctrl-C" : cfg.durationSeconds + "s after ramp"}`,
      "",
    ].join("\n")
  );

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
