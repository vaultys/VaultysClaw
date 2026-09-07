import { describe, it, expect } from "vitest";
import {
  PROXY_RULESET_VERSION,
  ProxyRuleValidationError,
  proxyResourceRuleWarnings,
  subjectScopedRuleIds,
  validateProxyRuleSet,
  type ProxyRuleSet,
} from "@/lib/proxy-rules";

const base = (resourceRules: ProxyRuleSet["resourceRules"]): ProxyRuleSet => ({
  version: PROXY_RULESET_VERSION,
  issuedAt: Date.UTC(2026, 0, 1),
  rules: [{ id: "h", subject: "any", hosts: ["openai.com"], effect: "deny" }],
  resourceRules,
});

describe("resource rule validation", () => {
  it("accepts an exact URI and a trailing /* prefix", () => {
    expect(() =>
      validateProxyRuleSet(
        base([
          { id: "r1", subject: "any", resources: ["file:///a/b.txt", "file:///a/c/*"], effect: "deny" },
        ])
      )
    ).not.toThrow();
  });

  it.each([
    ["file:///a/b*", "a mid-segment wildcard would authorize the sibling /a/bc"],
    ["file:///*/b", "a leading wildcard is not the supported form"],
    ["file:///a/**", "two wildcards"],
    ["/a/b", "not a URI — no scheme"],
    [" file:///a/b", "surrounding whitespace never matches"],
    ["file://*", "matches every resource of its scheme"],
  ])("rejects %s (%s)", (resource) => {
    expect(() =>
      validateProxyRuleSet(base([{ id: "r1", subject: "any", resources: [resource], effect: "allow" }]))
    ).toThrow(ProxyRuleValidationError);
  });

  it("rejects a resource rule whose id collides with a host rule", () => {
    // Audit records name a rule by id alone, so two rules answering to one id
    // would make the trail ambiguous about which fired.
    expect(() =>
      validateProxyRuleSet(base([{ id: "h", subject: "any", resources: ["file:///a"], effect: "deny" }]))
    ).toThrow(/duplicates an earlier rule id/);
  });

  it("rejects a workload-scoped rule with no workloadId", () => {
    expect(() =>
      validateProxyRuleSet(
        base([{ id: "r1", subject: "workload", resources: ["file:///a"], effect: "allow" }])
      )
    ).toThrow(/no workloadId/);
  });

  it("reports resource rules as subject-scoped, so the load-time refusal is predicted", () => {
    const set = base([
      { id: "r1", subject: "agent", resources: ["file:///a"], effect: "deny" },
      { id: "r2", subject: "any", resources: ["file:///b"], effect: "deny" },
    ]);
    expect(subjectScopedRuleIds(set)).toEqual(["r1"]);
  });
});

describe("proxyResourceRuleWarnings", () => {
  it("warns about a macOS symlinked root, which would silently match nothing", () => {
    const warnings = proxyResourceRuleWarnings(
      base([{ id: "r1", subject: "any", resources: ["file:///etc/*"], effect: "deny" }])
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("/private");
    expect(warnings[0]).toContain("match nothing");
  });

  it("stays advisory rather than fatal — /etc is real on Linux", () => {
    expect(() =>
      validateProxyRuleSet(base([{ id: "r1", subject: "any", resources: ["file:///etc/*"], effect: "deny" }]))
    ).not.toThrow();
  });

  it("says nothing about a path that is not under a symlinked root", () => {
    expect(
      proxyResourceRuleWarnings(
        base([{ id: "r1", subject: "any", resources: ["file:///Users/fx/repo/*"], effect: "deny" }])
      )
    ).toEqual([]);
  });
});
