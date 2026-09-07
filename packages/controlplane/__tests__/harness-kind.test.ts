import { describe, it, expect } from "vitest";
import {
  DEFAULT_HARNESS_KIND_CONFIG,
  HarnessKindConfigError,
  harnessKindConfigWarnings,
  parseHarnessKindConfig,
  type HarnessKindConfig,
} from "@/lib/harness-kind";

const config = (over: Partial<HarnessKindConfig> = {}): HarnessKindConfig => ({
  ...DEFAULT_HARNESS_KIND_CONFIG,
  ...over,
});

describe("parseHarnessKindConfig", () => {
  it("defaults a brand-new harness to observing everything and refusing nothing", () => {
    const parsed = parseHarnessKindConfig(null);
    expect(parsed.mode).toBe("observe");
    expect(parsed.resourceRules).toEqual([]);
    // Negative, not 0: a new harness has no status refresh to be fresh against,
    // and 0 would deny everything the moment it moved to `explicit`.
    expect(parsed.maxStatusAgeSeconds).toBeLessThan(0);
  });

  it("throws rather than falling back, so a parse error cannot turn enforcement off", () => {
    // The failure this guards: a malformed stored config silently becoming the
    // default would drop every deny rule *and* replace `explicit` with
    // `observe`, with nothing anywhere saying so.
    expect(() => parseHarnessKindConfig({ mode: "enforce" })).toThrow(HarnessKindConfigError);
    expect(() => parseHarnessKindConfig({ sandbox: "yes" })).toThrow(HarnessKindConfigError);
    expect(() => parseHarnessKindConfig({ maxStatusAgeSeconds: "60" })).toThrow(HarnessKindConfigError);
    expect(() => parseHarnessKindConfig([])).toThrow(HarnessKindConfigError);
  });

  it("validates rules through the same function the signer uses", () => {
    // A config that stores cleanly must never be one the signer later refuses —
    // that would leave an admin with a saved policy that silently never ships.
    expect(() =>
      parseHarnessKindConfig({
        resourceRules: [{ id: "r", subject: "any", resources: ["file:///a/b*"], effect: "deny" }],
      })
    ).toThrow(/trailing "\/\*"/);
  });

  it("round-trips a valid config", () => {
    const stored = {
      mode: "explicit",
      sandbox: "require",
      maxStatusAgeSeconds: 3600,
      resourceRules: [{ id: "no-ssh", subject: "any", resources: ["file:///home/fx/.ssh/*"], effect: "deny" }],
    };
    expect(parseHarnessKindConfig(stored)).toEqual(stored);
  });
});

describe("harnessKindConfigWarnings", () => {
  it("says plainly that observe mode enforces nothing", () => {
    const w = harnessKindConfigWarnings(config({ mode: "observe" }));
    expect(w.some((s) => s.includes("none are refused"))).toBe(true);
  });

  it("says plainly that sandbox off makes supervision advisory", () => {
    const w = harnessKindConfigWarnings(config({ sandbox: "off" }));
    expect(w.some((s) => s.includes("advisory"))).toBe(true);
  });

  it("warns that a subject-scoped rule takes the WHOLE set down, not just itself", () => {
    // The consequence an admin would otherwise discover from a host that stopped
    // enforcing: the Go verifier refuses the entire set when attribution is
    // unavailable, rather than letting one rule silently never match.
    const w = harnessKindConfigWarnings(
      config({
        resourceRules: [
          { id: "scoped", subject: "agent", resources: ["file:///a/*"], effect: "deny" },
          { id: "fine", subject: "any", resources: ["file:///b/*"], effect: "deny" },
        ],
      })
    );
    const warning = w.find((s) => s.includes("scoped"));
    expect(warning).toBeDefined();
    expect(warning).toContain("entire rule set");
    expect(warning).toContain("rules that would have worked");
  });

  it("explains that 0 with explicit mode denies everything, not that it is merely strict", () => {
    const w = harnessKindConfigWarnings(config({ maxStatusAgeSeconds: 0, mode: "explicit" }));
    expect(w.some((s) => s.includes("will be denied"))).toBe(true);
  });

  it("warns that unbounded staleness keeps a revoked certificate working", () => {
    const w = harnessKindConfigWarnings(config({ maxStatusAgeSeconds: -1 }));
    expect(w.some((s) => s.includes("revoked certificate"))).toBe(true);
  });

  it("carries the macOS symlinked-root warning through from the rule validator", () => {
    const w = harnessKindConfigWarnings(
      config({ resourceRules: [{ id: "r", subject: "any", resources: ["file:///etc/*"], effect: "deny" }] })
    );
    expect(w.some((s) => s.includes("/private"))).toBe(true);
  });

  it("says when there are no rules at all", () => {
    expect(harnessKindConfigWarnings(config()).some((s) => s.includes("No resource rules"))).toBe(true);
  });
});
