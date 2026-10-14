/**
 * The relationship plan. `db.ts` writes whatever `planLinks` returns, so a bug here is a graph that
 * looks subtly wrong — an agent running on someone else's laptop, or a rerun that duplicates every
 * edge — rather than an exception.
 */
import { describe, it, expect } from "vitest";
import { planLinks, linkId, LINK_LABELS, SIM_LINK_ID_PREFIX, type LinkableActor } from "../src/links.js";

function fleet(): LinkableActor[] {
  const actors: LinkableActor[] = [];
  for (let p = 0; p < 4; p++) {
    const owner = `did:vaultys:person-${p}`;
    actors.push({ did: `did:vaultys:sensor-${p}`, kind: "sensor", ownerDid: owner });
    actors.push({ did: `did:vaultys:device-${p}`, kind: "device", ownerDid: owner });
    actors.push({ did: `did:vaultys:mcp-${p}`, kind: "mcp", ownerDid: owner });
    for (let a = 0; a < 3; a++) {
      actors.push({ did: `did:vaultys:openclaw-${p}-${a}`, kind: "openclaw", ownerDid: owner });
    }
  }
  actors.push({ did: "did:vaultys:proxy-0", kind: "proxy", ownerDid: null });
  return actors;
}

describe("planLinks", () => {
  it("gives every agent one host and every openclaw one tool, inside its owner's estate", () => {
    const actors = fleet();
    const owner = new Map(actors.map((a) => [a.did, a.ownerDid]));
    const links = planLinks(actors);

    for (const agent of actors.filter((a) => a.kind === "openclaw" || a.kind === "mcp")) {
      const runsOn = links.filter((l) => l.fromDid === agent.did && l.label === LINK_LABELS.runsOn);
      expect(runsOn).toHaveLength(1);
      expect(owner.get(runsOn[0].toDid)).toBe(agent.ownerDid);
    }
    for (const agent of actors.filter((a) => a.kind === "openclaw")) {
      const uses = links.filter((l) => l.fromDid === agent.did && l.label === LINK_LABELS.usesTool);
      expect(uses).toHaveLength(1);
      expect(owner.get(uses[0].toDid)).toBe(agent.ownerDid);
    }
  });

  it("routes every host through a proxy, and only when there is one", () => {
    const actors = fleet();
    const hosts = actors.filter((a) => a.kind === "sensor" || a.kind === "device");
    const egress = planLinks(actors).filter((l) => l.label === LINK_LABELS.egressVia);
    expect(egress).toHaveLength(hosts.length);

    const noProxy = actors.filter((a) => a.kind !== "proxy");
    expect(planLinks(noProxy).some((l) => l.label === LINK_LABELS.egressVia)).toBe(false);
  });

  it("falls back to any host when the owner has none, and to nothing when the fleet has none", () => {
    const lone: LinkableActor = { did: "did:vaultys:openclaw-x", kind: "openclaw", ownerDid: "did:vaultys:nobody" };
    const host: LinkableActor = { did: "did:vaultys:sensor-y", kind: "sensor", ownerDid: "did:vaultys:other" };
    expect(planLinks([lone, host]).find((l) => l.label === LINK_LABELS.runsOn)?.toDid).toBe(host.did);
    expect(planLinks([lone])).toEqual([]);
  });

  it("is deterministic with unique, prefixed ids, so a rerun writes nothing", () => {
    const a = planLinks(fleet());
    const b = planLinks(fleet());
    expect(b).toEqual(a);
    expect(new Set(a.map((l) => l.id)).size).toBe(a.length);
    for (const l of a) {
      expect(l.id.startsWith(SIM_LINK_ID_PREFIX)).toBe(true);
      expect(l.id).toBe(linkId(l.fromDid, l.toDid, l.label));
    }
  });
});
