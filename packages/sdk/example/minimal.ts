/**
 * A minimal VaultysClaw Actor.
 *
 * Connects to the rebuilt control plane, registers, waits out admin approval,
 * receives a capability certificate, and gates its own work on what it was
 * actually granted — which may be less than it asked for.
 *
 *   pnpm --filter @vaultysclaw/sdk example
 *
 * Env: VC_CONTROL_PLANE_WS_URL (default ws://localhost:8081), VC_ACTOR_NAME.
 */

import path from "node:path";
import os from "node:os";
import { ActorRuntime } from "../src/index.js";

const wsUrl = process.env.VC_CONTROL_PLANE_WS_URL ?? "ws://localhost:8081";
const name = process.env.VC_ACTOR_NAME ?? "example-actor";
const stateDir = path.join(os.homedir(), ".vaultysclaw", "example-actor");

const actor = new ActorRuntime({
  name,
  kind: "openclaw",
  controlPlaneWsUrl: wsUrl,
  identityPath: path.join(stateDir, "identity.secret"),
  // A request, not a declaration — approve fewer of these in the console and
  // watch the output below reflect the admin's decision, not this list.
  requestedCapabilities: ["internet_access", "file_access"],
  capabilityStatePath: path.join(stateDir, "capabilities.json"),
});

actor.on("status", (status) => console.log(`[status] ${status}`));

actor.on("pending", ({ registrationId }) => {
  console.log(`[pending] awaiting approval — registration ${registrationId}`);
  console.log(`          approve "${name}" at http://localhost:3001/admin/actors`);
});

actor.on("connected", ({ did }) => {
  console.log(`[connected] identity proven — ${did}`);
});

actor.on("certificate", ({ certId, capabilities }) => {
  console.log(`[certificate] granted: ${capabilities.join(", ") || "(none)"}`);
  console.log(`              cert ${certId}`);
});

actor.on("config", (cfg) => {
  console.log(`[config] trust.failClosed=${cfg.trust.failClosed} maxStatusAge=${cfg.trust.maxStatusAgeSeconds}s`);
});

actor.on("error", (err) => console.error(`[error] ${err.message}`));

await actor.start();
console.log(`[start] connecting to ${wsUrl} as "${name}" (did ${actor.getDid()})`);

// Poll what we actually hold, so the effect of an approval — and of a restart —
// is visible without reading the database.
setInterval(() => {
  const granted = actor.getCapabilities();
  if (granted.length === 0) {
    console.log("[check] nothing granted yet — doing nothing, correctly");
    return;
  }

  // The coarse check.
  const net = actor.hasCapability("internet_access");

  // The precise one: same decision function the control plane and the Go SDK
  // use, resolved locally with no round trip.
  const decision = actor.resolvePermission({
    capability: "file_access",
    resource: "file:///tmp/example.txt",
  });

  console.log(
    `[check] granted=[${granted.join(", ")}] internet_access=${net} ` +
      `file_access(/tmp/example.txt)=${decision.allowed}` +
      (decision.grantingCertId ? ` via ${decision.grantingCertId}` : "") +
      (decision.reason ? ` — ${decision.reason}` : "")
  );
}, 3000);

process.on("SIGINT", () => {
  console.log("\n[stop] shutting down");
  actor.stop();
  process.exit(0);
});
