/**
 * The simulator's pure logic.
 *
 * Worth testing despite this being a dev tool: `expandMix` decides the fleet composition every
 * number in the report is relative to, and the error grouping is what makes a failing run
 * diagnosable. Both have already been wrong once — see the notes on the individual cases.
 */
import { describe, it, expect } from "vitest";
import { expandMix, AGENT_MIX, ESTATE_MIX, PERSONAS } from "../src/personas.js";
import { Metrics } from "../src/metrics.js";

describe("expandMix", () => {
  it("produces exactly the requested total", () => {
    for (const n of [0, 1, 7, 15, 100, 999, 2000, 5000, 7000]) {
      expect(expandMix(ESTATE_MIX, n)).toHaveLength(n);
      expect(expandMix(AGENT_MIX, n)).toHaveLength(n);
    }
  });

  it("is exact for totals that don't divide evenly — an 'about right' fleet makes every count suspect", () => {
    // 0.55/0.4/0.05 of 7 is 3.85/2.8/0.35: flooring alone yields 5, not 7.
    const kinds = expandMix(ESTATE_MIX, 7);
    expect(kinds).toHaveLength(7);
  });

  it("respects the weighting", () => {
    const kinds = expandMix(ESTATE_MIX, 1000);
    const sensors = kinds.filter((k) => k === "sensor").length;
    const devices = kinds.filter((k) => k === "device").length;
    const proxies = kinds.filter((k) => k === "proxy").length;
    expect(sensors).toBe(550);
    expect(devices).toBe(400);
    expect(proxies).toBe(50);
  });

  it("gives the remainder to the largest fractional parts, not to whichever key came first", () => {
    // 0.7/0.3 of 10 is exact; of 11 it is 7.7/3.3, so openclaw takes the extra one.
    const kinds = expandMix(AGENT_MIX, 11);
    expect(kinds.filter((k) => k === "openclaw")).toHaveLength(8);
    expect(kinds.filter((k) => k === "mcp")).toHaveLength(3);
  });

  it("returns nothing for a zero fleet rather than one stray member", () => {
    expect(expandMix(AGENT_MIX, 0)).toEqual([]);
  });

  it("only ever emits kinds that have a persona — an unknown kind would crash the spawner", () => {
    for (const kind of [...expandMix(ESTATE_MIX, 200), ...expandMix(AGENT_MIX, 200)]) {
      expect(PERSONAS[kind]).toBeDefined();
    }
  });
});

describe("Metrics.describe", () => {
  it("uses the message when there is one", () => {
    expect(Metrics.describe(new Error("connection refused"))).toBe("connection refused");
  });

  it("falls back to the code for a message-less socket error", () => {
    // The real case: a 7,000-actor run reported 18,449 errors as blank lines.
    const err = Object.assign(new Error(""), { code: "ECONNRESET" });
    expect(Metrics.describe(err)).toBe("Error: ECONNRESET");
  });

  it("falls back to errno, then to the name", () => {
    expect(Metrics.describe(Object.assign(new Error(""), { errno: -54 }))).toBe("Error: errno -54");
    const named = new Error("");
    named.name = "AggregateError";
    expect(Metrics.describe(named)).toBe("AggregateError (no message)");
  });

  it("survives a non-Error throw", () => {
    expect(Metrics.describe("just a string")).toBe("just a string");
    expect(Metrics.describe(undefined)).toBe("unknown non-Error throw");
  });
});

describe("Metrics error grouping", () => {
  it("collapses per-actor detail so one cause reads as one row", () => {
    const m = new Metrics();
    for (let i = 0; i < 500; i++) {
      m.recordError(`handshake failed for did:vaultys:00${i.toString(16).padStart(38, "0")}`);
    }
    expect(m.errors.size).toBe(1);
    expect([...m.errors.values()][0]).toBe(500);
  });

  it("keeps genuinely different causes apart", () => {
    const m = new Metrics();
    m.recordError("connection refused");
    m.recordError("Not authenticated");
    m.recordError("connection refused");
    expect(m.errors.size).toBe(2);
    expect(m.errors.get("connection refused")).toBe(2);
  });
});

describe("Metrics percentiles", () => {
  it("reports 0 rather than NaN before any handshake completes", () => {
    expect(new Metrics().percentile(50)).toBe(0);
  });

  it("orders by value, not insertion", () => {
    const m = new Metrics();
    for (const ms of [900, 100, 500, 300, 700]) m.recordHandshake(ms);
    expect(m.percentile(50)).toBe(500);
    expect(m.percentile(100)).toBe(900);
  });
});
