/**
 * Ownership and the people who hold it.
 *
 * The distribution is the thing worth pinning. `db.ts` writes whatever `ownerIndexForDid` returns,
 * so a bug here is not an exception — it is a graph that looks subtly wrong, or an out-of-range
 * index that becomes an owner DID pointing at nothing. Both are much cheaper to catch here than in
 * a 7,000-Actor run.
 */
import { describe, it, expect } from "vitest";
import { ownerIndexForDid, unitHash } from "../src/ownership.js";
import { displayName, emailFor, defaultHumanCount, SIM_EMAIL_DOMAIN } from "../src/people.js";
import { PERSONAS, AGENT_MIX, ESTATE_MIX, expandMix } from "../src/personas.js";

/** Stand-ins for the DIDs a run produces — hex, and varying only in the tail, like the real ones. */
function dids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `did:vaultys:${(i * 2654435761).toString(16)}`);
}

describe("ownerIndexForDid", () => {
  it("always lands inside the roster — an out-of-range index is an owner DID that doesn't exist", () => {
    for (const humanCount of [1, 2, 7, 100, 1400, 5000]) {
      for (const did of dids(2000)) {
        const idx = ownerIndexForDid(did, humanCount);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(humanCount);
      }
    }
  });

  it("is stable for a DID, so the graph doesn't rearrange itself between runs", () => {
    for (const did of dids(500)) {
      expect(ownerIndexForDid(did, 1400)).toBe(ownerIndexForDid(did, 1400));
    }
  });

  it("returns -1 rather than 0 when there are no people — 0 would index an empty roster", () => {
    expect(ownerIndexForDid("did:vaultys:abc", 0)).toBe(-1);
  });

  it("skews, but not pathologically: the busiest owner holds several times the mean, not a hundred", () => {
    const humanCount = 1400;
    const fleet = dids(7000);
    const tally = new Map<number, number>();
    for (const did of fleet) {
      const idx = ownerIndexForDid(did, humanCount);
      tally.set(idx, (tally.get(idx) ?? 0) + 1);
    }
    const counts = [...tally.values()];
    const mean = fleet.length / humanCount;
    const busiest = Math.max(...counts);

    // Uniform would put the busiest at ~2x the mean at this size; the point of the skew is that it
    // is visibly more than that. The upper bound is the part that matters: one person owning a
    // hundred Actors reads as a generator bug, not as a power user.
    expect(busiest).toBeGreaterThan(mean * 2);
    expect(busiest).toBeLessThan(mean * 8);
  });

  it("leaves almost nobody with nothing — a directory of empty people is not an estate", () => {
    const humanCount = 1400;
    const owners = new Set(dids(7000).map((did) => ownerIndexForDid(did, humanCount)));
    expect(owners.size).toBeGreaterThan(humanCount * 0.9);
  });
});

describe("unitHash", () => {
  it("stays in [0, 1)", () => {
    for (const did of dids(1000)) {
      const u = unitHash(did);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("spreads across the range rather than clumping — this is what the skew is applied to", () => {
    const buckets = new Array(10).fill(0);
    for (const did of dids(10_000)) buckets[Math.floor(unitHash(did) * 10)]++;
    for (const n of buckets) expect(n).toBeGreaterThan(500);
  });
});

describe("people", () => {
  it("gives every person a unique email — User.email is unique, so a collision fails the insert", () => {
    const emails = new Set<string>();
    for (let i = 0; i < 3000; i++) emails.add(emailFor(displayName(i), i));
    expect(emails.size).toBe(3000);
  });

  it("keeps every email inside the reserved domain, which is what reset scopes on", () => {
    for (let i = 0; i < 200; i++) {
      expect(emailFor(displayName(i), i).endsWith(`@${SIM_EMAIL_DOMAIN}`)).toBe(true);
    }
  });

  it("folds accents and punctuation out of the address but not out of the name", () => {
    expect(displayName(2)).toContain("é");
    expect(emailFor("Aurélie Lefèvre", 2)).toBe("aurelie.lefevre2@sim.invalid");
    expect(emailFor("Pierre-Yves Clément", 9)).toBe("pierre.yves.clement9@sim.invalid");
  });

  it("uses the whole first×last product before repeating a name", () => {
    // 48 × 60. The stride is 49, and this only holds because gcd(49, 60) === 1 — see `displayName`.
    const names = new Set<string>();
    for (let i = 0; i < 2880; i++) names.add(displayName(i));
    expect(names.size).toBe(2880);
  });

  it("gives consecutive people different surnames — the busiest owners share the low indices", () => {
    // The real symptom this guards: ownership skews toward low indices, so when the surname
    // advanced only once per pass through the first names, every heavy owner on the graph was
    // called Martin, which reads as a broken generator.
    const surnames = new Set(Array.from({ length: 20 }, (_, i) => displayName(i).split(" ").pop()));
    expect(surnames.size).toBe(20);
  });

  it("never pairs a name with itself — the pools are kept disjoint for this", () => {
    for (let i = 0; i < 2880; i++) {
      const [first, ...rest] = displayName(i).split(" ");
      expect(rest.join(" ")).not.toBe(first);
    }
  });

  it("is deterministic — the same index is the same person on every run", () => {
    expect(displayName(0)).toBe(displayName(0));
    expect(displayName(0)).not.toBe(displayName(1));
  });

  it("scales the population with the fleet instead of defaulting to a constant", () => {
    expect(defaultHumanCount(7000)).toBe(1400);
    expect(defaultHumanCount(50)).toBe(10);
    // A fleet too small for the ratio still gets somebody: zero people means zero ownership edges,
    // which is the behaviour `--humans 0` is for, not something a small `--actors` should trigger.
    expect(defaultHumanCount(1)).toBe(1);
    expect(defaultHumanCount(0)).toBe(1);
  });
});

describe("Persona.ownedByHuman", () => {
  it("covers every kind the fleet can spawn, so no Actor falls through undecided", () => {
    for (const kind of [...expandMix(ESTATE_MIX, 200), ...expandMix(AGENT_MIX, 200)]) {
      expect(typeof PERSONAS[kind].ownedByHuman).toBe("boolean");
    }
  });

  it("leaves the proxy ownerless — it is infrastructure in front of many people's traffic", () => {
    expect(PERSONAS.proxy.ownedByHuman).toBe(false);
    expect(PERSONAS.openclaw.ownedByHuman).toBe(true);
    expect(PERSONAS.device.ownedByHuman).toBe(true);
  });
});
