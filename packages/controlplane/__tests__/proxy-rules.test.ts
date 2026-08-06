import { describe, expect, it } from "vitest";
import {
  PROXY_RULESET_VERSION,
  ProxyRuleValidationError,
  subjectScopedRuleIds,
  validateProxyRuleSet,
  type ProxyRule,
  type ProxyRuleSet,
} from "@/lib/proxy-rules";
import { proxyConfigPayload } from "@/lib/webhook-payloads";
import {
  DEFAULT_PROXY_KIND_CONFIG,
  ProxyKindConfigError,
  parseProxyKindConfig,
  proxyKindConfigWarnings,
} from "@/lib/proxy-kind";

/**
 * These are guard rails, not conveniences. The Go verifier rejects a
 * structurally invalid rule set rather than skipping the offending rule —
 * because silently dropping a `deny` rule widens access — which means one bad
 * rule takes the *whole* set down on every host that loads it. Catching it here
 * turns a fleet-wide loss of enforcement into a form error.
 */

function rule(overrides: Partial<ProxyRule> = {}): ProxyRule {
  return {
    id: "r1",
    subject: "any",
    hosts: [".openai.com"],
    effect: "deny",
    ...overrides,
  };
}

function set(rules: ProxyRule[]): ProxyRuleSet {
  return { version: PROXY_RULESET_VERSION, rules, issuedAt: 1_700_000_000_000 };
}

describe("validateProxyRuleSet", () => {
  it("accepts a well-formed set covering every subject and effect", () => {
    expect(() =>
      validateProxyRuleSet(
        set([
          rule({ id: "deny-openai" }),
          rule({ id: "agents-deny", subject: "agent", hosts: [".internal.example"], ports: [443] }),
          rule({
            id: "wl-allow",
            subject: "workload",
            workloadId: "wl-1",
            hosts: ["api.github.com"],
            effect: "allow",
          }),
        ])
      )
    ).not.toThrow();
  });

  it("accepts an empty rule set", () => {
    // A proxy with no rules is a valid configuration — every request is then
    // decided by its certificate alone.
    expect(() => validateProxyRuleSet(set([]))).not.toThrow();
  });

  it("rejects a wrong version", () => {
    expect(() => validateProxyRuleSet({ ...set([]), version: 2 })).toThrow(ProxyRuleValidationError);
  });

  it("rejects a rule with no id", () => {
    // Audit records reference rules by id; an unnamed rule produces a decision
    // nobody can trace back to its cause.
    expect(() => validateProxyRuleSet(set([rule({ id: "  " })]))).toThrow(/no id/);
  });

  it("rejects duplicate rule ids", () => {
    expect(() => validateProxyRuleSet(set([rule({ id: "dup" }), rule({ id: "dup" })]))).toThrow(
      /duplicates/
    );
  });

  it("rejects unknown effects and subjects", () => {
    expect(() =>
      validateProxyRuleSet(set([rule({ effect: "audit" as ProxyRule["effect"] })]))
    ).toThrow(/unknown effect/);
    expect(() =>
      validateProxyRuleSet(set([rule({ subject: "everyone" as ProxyRule["subject"] })]))
    ).toThrow(/unknown subject/);
  });

  it("rejects a workload rule with no workloadId", () => {
    expect(() => validateProxyRuleSet(set([rule({ subject: "workload" })]))).toThrow(/workloadId/);
  });

  it("rejects a workloadId on a subject that would ignore it", () => {
    // A rule that *looks* narrower than it is, is worse than an invalid one: an
    // admin reads "workload wl-1 only" and gets "every agent".
    expect(() =>
      validateProxyRuleSet(set([rule({ subject: "agent", workloadId: "wl-1" })]))
    ).toThrow(/would be ignored/);
  });

  it("rejects a rule matching no hosts", () => {
    expect(() => validateProxyRuleSet(set([rule({ hosts: [] })]))).toThrow(/no hosts/);
    expect(() => validateProxyRuleSet(set([rule({ hosts: ["  "] })]))).toThrow(/empty host/);
    expect(() => validateProxyRuleSet(set([rule({ hosts: ["."] })]))).toThrow(/empty host/);
  });

  it("rejects a wildcard host, which the verifier does not support", () => {
    // The verifier matches exact hostnames or dot-prefixed suffixes only. A
    // wildcard would be treated as a literal character and silently match
    // nothing — a deny rule that does not deny.
    expect(() => validateProxyRuleSet(set([rule({ hosts: ["*.openai.com"] })]))).toThrow(
      /wildcard/
    );
  });

  it("rejects a host that is really a URL or host:port", () => {
    expect(() => validateProxyRuleSet(set([rule({ hosts: ["https://api.openai.com"] })]))).toThrow(
      /URL or host:port/
    );
    expect(() => validateProxyRuleSet(set([rule({ hosts: ["api.openai.com:443"] })]))).toThrow(
      /URL or host:port/
    );
  });

  it("rejects out-of-range ports", () => {
    for (const port of [0, -1, 65536, 1.5]) {
      expect(() => validateProxyRuleSet(set([rule({ ports: [port] })]))).toThrow(/invalid port/);
    }
  });
});

describe("subjectScopedRuleIds", () => {
  it("reports only the rules that need attribution", () => {
    const ids = subjectScopedRuleIds(
      set([
        rule({ id: "a", subject: "any" }),
        rule({ id: "b", subject: "agent" }),
        rule({ id: "c", subject: "workload", workloadId: "wl" }),
      ])
    );
    expect(ids).toEqual(["b", "c"]);
  });
});

describe("parseProxyKindConfig", () => {
  it("treats missing and empty configs as the default", () => {
    // A proxy that has never been configured is a valid state: it enforces its
    // certificate and nothing else.
    for (const raw of [null, undefined, {}]) {
      expect(parseProxyKindConfig(raw)).toEqual(DEFAULT_PROXY_KIND_CONFIG);
    }
  });

  it("defaults maxStatusAgeSeconds to unbounded, written as a negative", () => {
    // Not 0 — that is the *strictest* value and would deny everything on a
    // freshly created proxy that has no status refresh to be fresh against.
    expect(DEFAULT_PROXY_KIND_CONFIG.maxStatusAgeSeconds).toBeLessThan(0);
  });

  it("parses a full config", () => {
    const config = parseProxyKindConfig({
      mode: "explicit",
      listenAddr: " 127.0.0.1:8888 ",
      maxStatusAgeSeconds: 3600,
      rules: [{ id: "r", subject: "any", hosts: [".openai.com"], effect: "deny" }],
    });
    expect(config.mode).toBe("explicit");
    expect(config.listenAddr).toBe("127.0.0.1:8888");
    expect(config.maxStatusAgeSeconds).toBe(3600);
    expect(config.rules).toHaveLength(1);
  });

  it("rejects a malformed config rather than falling back to an empty one", () => {
    // Falling back would drop every deny rule the admin wrote, which is exactly
    // the failure mode that must never be silent.
    expect(() => parseProxyKindConfig("not an object")).toThrow(ProxyKindConfigError);
    expect(() => parseProxyKindConfig([])).toThrow(ProxyKindConfigError);
    expect(() => parseProxyKindConfig({ mode: "transparent" })).toThrow(/mode must be/);
    expect(() => parseProxyKindConfig({ maxStatusAgeSeconds: "3600" })).toThrow(/integer/);
    expect(() => parseProxyKindConfig({ maxStatusAgeSeconds: 1.5 })).toThrow(/integer/);
    expect(() => parseProxyKindConfig({ rules: "nope" })).toThrow(/must be an array/);
  });

  it("validates rules through the same path that will sign them", () => {
    // An admin must not be able to store a config that fails at push time, when
    // the failure is a silent fleet-wide loss of the rule set.
    expect(() =>
      parseProxyKindConfig({ rules: [{ id: "r", subject: "any", hosts: ["*.evil"], effect: "deny" }] })
    ).toThrow(/wildcard/);
  });
});

describe("proxyKindConfigWarnings", () => {
  it("warns that subject-scoped rules will not load in explicit mode", () => {
    const warnings = proxyKindConfigWarnings({
      mode: "explicit",
      maxStatusAgeSeconds: 3600,
      rules: [rule({ id: "agents-deny", subject: "agent" })],
    });
    expect(warnings.join(" ")).toMatch(/refuse to load/);
    expect(warnings.join(" ")).toContain("agents-deny");
  });

  it("warns that system mode is not implemented", () => {
    const warnings = proxyKindConfigWarnings({
      mode: "system",
      maxStatusAgeSeconds: 3600,
      rules: [],
    });
    expect(warnings.join(" ")).toMatch(/not implemented/);
  });

  it("warns about both ends of maxStatusAgeSeconds", () => {
    // 0 is the strict end: offline it denies everything. Negative is unbounded:
    // a revoked certificate keeps working. Both are legitimate choices and
    // neither should be silent.
    expect(
      proxyKindConfigWarnings({ mode: "explicit", maxStatusAgeSeconds: 0, rules: [] }).join(" ")
    ).toMatch(/deny every governed request/);
    expect(
      proxyKindConfigWarnings({ mode: "explicit", maxStatusAgeSeconds: -1, rules: [] }).join(" ")
    ).toMatch(/revoked certificate keeps working/);
  });

  it("says nothing about a plain, valid explicit-mode config", () => {
    expect(
      proxyKindConfigWarnings({
        mode: "explicit",
        maxStatusAgeSeconds: 3600,
        rules: [rule({ subject: "any" })],
      })
    ).toEqual([]);
  });
});

describe("proxyConfigPayload", () => {
  const actor = { did: "did:vaultys:proxy", name: "edge-proxy", kind: "proxy" };
  const r = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    subject: "any",
    hosts: [".openai.com"],
    effect: "deny",
    ...extra,
  });

  it("reports which rule was added and which was removed", () => {
    // The question an auditor actually asks. A before/after blob of a thirty-rule
    // set answers it very badly.
    const payload = proxyConfigPayload(
      actor,
      { rules: [r("keep"), r("gone")] },
      { mode: "explicit", maxStatusAgeSeconds: 3600, rules: [r("keep"), r("fresh")] }
    );

    expect((payload.ruleChanges as any).added.map((x: any) => x.id)).toEqual(["fresh"]);
    expect((payload.ruleChanges as any).removed.map((x: any) => x.id)).toEqual(["gone"]);
    expect(payload.ruleCount).toBe(2);
    expect(payload.mode).toBe("explicit");
  });

  it("summarises a rule's effect, subject, hosts and ports", () => {
    const payload = proxyConfigPayload(actor, null, {
      rules: [
        r("wl", { subject: "workload", workloadId: "wl-1", hosts: ["a.example", "b.example"], ports: [443, 8443], effect: "allow" }),
      ],
    });
    expect((payload.rules as any)[0].summary).toBe("allow workload:wl-1 a.example,b.example:443,8443");
  });

  it("treats a null before as everything being new", () => {
    // The first time a proxy is configured there is no previous state; every rule
    // is an addition rather than silently no change at all.
    const payload = proxyConfigPayload(actor, null, { rules: [r("first")] });
    expect((payload.ruleChanges as any).added.map((x: any) => x.id)).toEqual(["first"]);
    expect((payload.ruleChanges as any).removed).toEqual([]);
  });

  it("carries no secret-looking fields", () => {
    // The one payload in this package that deliberately includes kindConfig
    // content, so it gets its own check that the exception stays narrow.
    const body = JSON.stringify(
      proxyConfigPayload(actor, null, { mode: "explicit", maxStatusAgeSeconds: 0, rules: [r("x")] })
    );
    expect(body).not.toMatch(/secret|token|password|privateKey/i);
  });
});
