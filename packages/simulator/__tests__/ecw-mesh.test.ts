import { describe, expect, it } from "vitest";
import { VaultysId } from "@vaultys/id";
import { signCertStatusResponseCert } from "@vaultysclaw/policy";
import { forgeStaple, signFleetMessage, verifyFleetMessage } from "../src/ecw/mesh.js";
import { DRONE_ACTIONS, FLEET, REGISTRY, SPOTLIGHT_KEY } from "../src/ecw/scenario.js";
import { assertValidCapabilityName } from "@vaultysclaw/policy";

const vid = async () => (await VaultysId.generateMachine()).toVersion(1);
const opts = { requirement: "fleet:telemetry.share", stapleTtlMs: 6_000, maxMessageAgeMs: 4_000 };

async function staple(cp: VaultysId, did: string, status: "active" | "revoked", capabilities: string[]) {
  return signCertStatusResponseCert(cp, {
    certId: "cert-1",
    agentDid: did,
    status,
    capabilities: capabilities as never,
    expiresAt: null,
  });
}

async function message(sender: VaultysId, proof: string | null, extra: { from?: string; sentAt?: number } = {}) {
  return signFleetMessage(sender, {
    id: crypto.randomUUID(),
    messageType: "telemetry",
    payload: { x: 1, y: 2 },
    sentAt: extra.sentAt ?? Date.now(),
    staple: proof,
    from: extra.from,
  });
}

describe("fleet mesh verification", () => {
  it("accepts a signed message carrying a fresh, active, sufficient proof", async () => {
    const [cp, drone] = [await vid(), await vid()];
    const token = await message(drone, await staple(cp, drone.did, "active", ["fleet:telemetry.share"]));
    expect(verifyFleetMessage(cp, token, opts)).toMatchObject({ accepted: true, from: drone.did });
  });

  it("refuses once the control plane has signed the certificate as revoked", async () => {
    const [cp, drone] = [await vid(), await vid()];
    const token = await message(drone, await staple(cp, drone.did, "revoked", ["fleet:telemetry.share"]));
    expect(verifyFleetMessage(cp, token, opts)).toMatchObject({ accepted: false, check: "status" });
  });

  it("refuses a replayed active proof once it is older than the TTL", async () => {
    const [cp, drone] = [await vid(), await vid()];
    const proof = await staple(cp, drone.did, "active", ["fleet:telemetry.share"]);
    const token = await message(drone, proof, { sentAt: Date.now() + 7_000 });
    expect(verifyFleetMessage(cp, token, { ...opts, now: Date.now() + 7_000 })).toMatchObject({
      accepted: false,
      check: "proof-age",
    });
  });

  it("refuses a proof the sender forged with its own key", async () => {
    const [cp, drone] = [await vid(), await vid()];
    const forged = await forgeStaple(drone, drone.did, "cert-1", ["fleet:command"]);
    const token = await message(drone, forged);
    expect(verifyFleetMessage(cp, token, { ...opts, requirement: "fleet:command" })).toMatchObject({
      accepted: false,
      check: "proof-signature",
    });
  });

  it("refuses a capability the proof does not carry", async () => {
    const [cp, drone] = [await vid(), await vid()];
    const token = await message(drone, await staple(cp, drone.did, "active", ["fleet:telemetry.share"]));
    expect(verifyFleetMessage(cp, token, { ...opts, requirement: "fleet:command" })).toMatchObject({
      accepted: false,
      check: "capability",
    });
  });

  it("refuses a message claiming another member's identity", async () => {
    const [cp, c2, attacker] = [await vid(), await vid(), await vid()];
    const token = await message(attacker, await staple(cp, c2.did, "active", ["fleet:command"]), { from: c2.did });
    expect(verifyFleetMessage(cp, token, opts)).toMatchObject({ accepted: false, check: "identity" });
  });

  it("refuses another member's proof attached to one's own message", async () => {
    const [cp, c2, drone] = [await vid(), await vid(), await vid()];
    const token = await message(drone, await staple(cp, c2.did, "active", ["fleet:command"]));
    expect(verifyFleetMessage(cp, token, { ...opts, requirement: "fleet:command" })).toMatchObject({
      accepted: false,
      check: "proof-subject",
    });
  });

  it("refuses an exact replay inside the freshness window", async () => {
    const [cp, drone] = [await vid(), await vid()];
    const token = await message(drone, await staple(cp, drone.did, "active", ["fleet:telemetry.share"]));
    const seen = new Set<string>();
    expect(verifyFleetMessage(cp, token, { ...opts, seen }).accepted).toBe(true);
    expect(verifyFleetMessage(cp, token, { ...opts, seen })).toMatchObject({ accepted: false, check: "replay" });
  });
});

describe("ECW scenario data", () => {
  it("uses only valid capability names", () => {
    for (const entry of REGISTRY) expect(() => assertValidCapabilityName(entry.name)).not.toThrow();
    for (const action of DRONE_ACTIONS) expect(() => assertValidCapabilityName(action.capability)).not.toThrow();
  });

  it("grants every member only registry or built-in names", () => {
    const registry = new Set(REGISTRY.map((r) => r.name));
    for (const member of FLEET)
      for (const c of member.capabilities) expect(registry.has(c) || !c.includes(":")).toBe(true);
  });

  it("leaves the spotlight drone with both granted and refused buttons", () => {
    const spotlight = FLEET.find((m) => m.key === SPOTLIGHT_KEY)!;
    const granted = DRONE_ACTIONS.filter((a) => spotlight.capabilities.includes(a.capability));
    expect(granted.length).toBeGreaterThan(2);
    expect(granted.length).toBeLessThan(DRONE_ACTIONS.length);
  });
});
