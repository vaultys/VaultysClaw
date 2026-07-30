#!/usr/bin/env tsx
/**
 * VaultysClaw Demo Simulator
 *
 * Starts 30 fake agents that connect to the control plane via WebSocket
 * with real VaultysId cryptography, then fires demo workflows on a schedule.
 *
 * Prerequisites:
 *   1. Control plane running  (pnpm vaultysclaw:dev)
 *   2. Demo seed run          (pnpm demo:seed)
 *
 * Usage:
 *   pnpm demo:start
 */

import path from "path";
import { fileURLToPath } from "url";
import { AgentSimulator, loadOrCreateIdentity } from "./agent-sim.js";
import { SensorSimulator, loadOrCreateIdentity as loadOrCreateSensorIdentity } from "./sensor-sim.js";
import { ScenarioRunner } from "./scenario-runner.js";
import { DEMO_AGENTS, DEMO_SENSORS, WS_URL, BASE_URL } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDENTITIES_DIR = path.join(__dirname, "identities");

async function main() {
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│          VaultysClaw Demo Simulator                         │");
  console.log(`│  Control Plane : ${BASE_URL.padEnd(44)}│`);
  console.log(`│  WebSocket     : ${WS_URL.padEnd(44)}│`);
  console.log(`│  Agents        : ${String(DEMO_AGENTS.length).padEnd(44)}│`);
  console.log(`│  Sensors       : ${String(DEMO_SENSORS.length).padEnd(44)}│`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log();

  // ── Load identities ─────────────────────────────────────────────
  console.log("Loading agent identities…");
  const simulators: AgentSimulator[] = [];

  for (const agentConfig of DEMO_AGENTS) {
    const identityPath = path.join(IDENTITIES_DIR, `${agentConfig.name}.txt`);
    try {
      const vid = await loadOrCreateIdentity(identityPath);
      const sim = new AgentSimulator(vid, agentConfig, WS_URL);

      // If the server doesn't know this DID yet, we'd need to approve it.
      // Normally seed-demo.ts has already created the agent record, so
      // the server auto-approves. Log a hint if registration_pending fires.
      sim.on("registration_pending", (registrationId: string) => {
        console.log(`\n  ⚠  ${agentConfig.name}: registration pending (${registrationId})`);
        console.log(`     Run 'pnpm demo:seed' first, or approve manually in the UI.\n`);
      });

      simulators.push(sim);
    } catch (err) {
      console.error(`  ✗ Failed to load identity for ${agentConfig.name}: ${err}`);
    }
  }

  console.log(`  ${simulators.length} identities ready\n`);

  // ── Load sensor identities ───────────────────────────────────────
  console.log("Loading sensor identities…");
  const sensorSimulators: SensorSimulator[] = [];

  for (const sensorConfig of DEMO_SENSORS) {
    const identityPath = path.join(IDENTITIES_DIR, `${sensorConfig.name}.txt`);
    try {
      const vid = await loadOrCreateSensorIdentity(identityPath);
      const sim = new SensorSimulator(vid, sensorConfig, WS_URL);

      // seed-demo.ts pre-creates these device DIDs as already-approved
      // SensorDevices, so this should always auto-connect — but log a hint
      // in case simulator:seed was skipped.
      sim.on("registration_pending", (registrationId: string) => {
        console.log(`\n  ⚠  ${sensorConfig.name}: registration pending (${registrationId})`);
        console.log(`     Run 'pnpm simulator:seed' first, or approve manually in the UI.\n`);
      });

      sensorSimulators.push(sim);
    } catch (err) {
      console.error(`  ✗ Failed to load identity for ${sensorConfig.name}: ${err}`);
    }
  }

  console.log(`  ${sensorSimulators.length} identities ready\n`);

  // ── Connect agents — stagger by 300 ms to avoid thundering herd ──
  console.log("Connecting agents…");
  let onlineCount = 0;
  for (const sim of simulators) {
    sim.on("online", () => {
      onlineCount++;
      if (onlineCount === simulators.length) {
        console.log(`\n  ✓ All ${onlineCount} agents online\n`);
        startScenarios();
      }
    });
    sim.connect();
    await sleep(300);
  }

  // ── Connect sensors — same stagger ───────────────────────────────
  console.log("Connecting sensors…");
  let sensorsOnlineCount = 0;
  for (const sim of sensorSimulators) {
    sim.on("online", () => {
      sensorsOnlineCount++;
      if (sensorsOnlineCount === sensorSimulators.length) {
        console.log(`\n  ✓ All ${sensorsOnlineCount} sensors online\n`);
      }
    });
    sim.connect();
    await sleep(300);
  }

  // ── Scenario runner ─────────────────────────────────────────────
  let runner: ScenarioRunner;

  function startScenarios() {
    runner = new ScenarioRunner();
    runner.start().catch((err) => console.error("Scenario runner error:", err));
  }

  // ── Graceful shutdown ────────────────────────────────────────────
  function shutdown() {
    console.log("\n  Shutting down simulator…");
    runner?.stop();
    simulators.forEach((s) => s.stop());
    sensorSimulators.forEach((s) => s.stop());
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // ── Status line every 60 s ───────────────────────────────────────
  setInterval(() => {
    const now = new Date().toISOString().slice(11, 19);
    console.log(
      `  [${now}] Simulator running — ${onlineCount}/${simulators.length} agents, ${sensorsOnlineCount}/${sensorSimulators.length} sensors online`
    );
  }, 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Fatal simulator error:", err);
  process.exit(1);
});
