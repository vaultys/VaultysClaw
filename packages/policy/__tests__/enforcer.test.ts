/**
 * Unit tests for the runtime policy enforcer.
 *
 * These exercise the real `PolicyEnforcer` from the package (no mirror class):
 *   - capability gate (incl. the legacy "agent" → "agent_communication" alias)
 *   - policy expiry gate
 *   - daily token budget gate
 *   - hourly request rate gate (increment, window reset, blocking)
 *   - gate ordering when several would fail
 *   - resolveEffectiveAction
 */

import { describe, it, expect } from "vitest";
import {
  PolicyEnforcer,
  resolveEffectiveAction,
  type PolicyContext,
  type DailyTokenUsage,
  type ResourceLimits,
} from "../src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an enforcer with a controllable clock and token-usage source. */
function makeEnforcer(opts: {
  usage?: DailyTokenUsage | null;
  now?: () => number;
} = {}) {
  return new PolicyEnforcer({
    getDailyTokenUsage: () => opts.usage ?? { promptTokens: 0, completionTokens: 0 },
    now: opts.now,
  });
}

/** A context that grants `api_call` and imposes the given limits. */
function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    capabilities: ["api_call"],
    resourceLimits: null,
    policyId: null,
    policyExpiresAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveEffectiveAction
// ---------------------------------------------------------------------------

describe("resolveEffectiveAction", () => {
  it("maps the legacy 'agent' action to 'agent_communication'", () => {
    expect(resolveEffectiveAction("agent")).toBe("agent_communication");
  });

  it("leaves other actions unchanged", () => {
    expect(resolveEffectiveAction("api_call")).toBe("api_call");
    expect(resolveEffectiveAction("file_access")).toBe("file_access");
  });
});

// ---------------------------------------------------------------------------
// Capability gate
// ---------------------------------------------------------------------------

describe("Capability gate", () => {
  it("passes when the capability is granted", () => {
    const e = makeEnforcer();
    expect(() => e.enforce("api_call", ctx())).not.toThrow();
  });

  it("blocks when the capability is not granted", () => {
    const e = makeEnforcer();
    expect(() => e.enforce("file_access", ctx({ capabilities: ["api_call"] }))).toThrow(
      "Capability 'file_access' not granted"
    );
  });

  it("resolves the legacy 'agent' action against 'agent_communication'", () => {
    const e = makeEnforcer();
    expect(() =>
      e.enforce("agent", ctx({ capabilities: ["agent_communication"] }))
    ).not.toThrow();
  });

  it("reports the original action name (not the resolved one) in the error", () => {
    const e = makeEnforcer();
    expect(() => e.enforce("agent", ctx({ capabilities: [] }))).toThrow(
      "Capability 'agent' not granted"
    );
  });
});

// ---------------------------------------------------------------------------
// Policy expiry gate
// ---------------------------------------------------------------------------

describe("Policy expiry gate", () => {
  it("passes when no expiry is set", () => {
    const e = makeEnforcer();
    expect(() => e.enforce("api_call", ctx())).not.toThrow();
  });

  it("passes when expiry is in the future", () => {
    const e = makeEnforcer();
    expect(() =>
      e.enforce(
        "api_call",
        ctx({ policyExpiresAt: new Date(Date.now() + 3600_000).toISOString() })
      )
    ).not.toThrow();
  });

  it("blocks when expiry is in the past and includes the policy id", () => {
    const e = makeEnforcer();
    const c = ctx({
      policyId: "pol-abc",
      policyExpiresAt: new Date(Date.now() - 1).toISOString(),
    });
    expect(() => e.enforce("api_call", c)).toThrow("expired");
    expect(() => e.enforce("api_call", c)).toThrow("pol-abc");
  });

  it("uses 'unknown' when policyId is null", () => {
    const e = makeEnforcer();
    expect(() =>
      e.enforce(
        "api_call",
        ctx({ policyExpiresAt: new Date(Date.now() - 1).toISOString() })
      )
    ).toThrow("unknown");
  });

  it("honours the injected clock", () => {
    const expiry = 1_000_000;
    const c = ctx({ policyExpiresAt: new Date(expiry).toISOString() });

    const before = makeEnforcer({ now: () => expiry - 1 });
    expect(() => before.enforce("api_call", c)).not.toThrow();

    const after = makeEnforcer({ now: () => expiry + 1 });
    expect(() => after.enforce("api_call", c)).toThrow("expired");
  });
});

// ---------------------------------------------------------------------------
// Daily token budget gate
// ---------------------------------------------------------------------------

describe("Daily token budget gate", () => {
  const limit: ResourceLimits = { maxTokensPerDay: 1000 };

  it("passes when there is no token limit", () => {
    const e = makeEnforcer({ usage: { promptTokens: 9e6, completionTokens: 9e6 } });
    expect(() =>
      e.enforce("api_call", ctx({ resourceLimits: { maxRequestsPerHour: 10 } }))
    ).not.toThrow();
  });

  it("passes when usage is below the budget", () => {
    const e = makeEnforcer({ usage: { promptTokens: 400, completionTokens: 400 } });
    expect(() => e.enforce("api_call", ctx({ resourceLimits: limit }))).not.toThrow();
  });

  it("passes at exactly budget minus one", () => {
    const e = makeEnforcer({ usage: { promptTokens: 500, completionTokens: 499 } });
    expect(() => e.enforce("api_call", ctx({ resourceLimits: limit }))).not.toThrow();
  });

  it("blocks when usage equals the budget", () => {
    const e = makeEnforcer({ usage: { promptTokens: 600, completionTokens: 400 } });
    expect(() => e.enforce("api_call", ctx({ resourceLimits: limit }))).toThrow(
      "Daily token budget exhausted"
    );
    expect(() => e.enforce("api_call", ctx({ resourceLimits: limit }))).toThrow(
      "1000 / limit 1000"
    );
  });

  it("blocks when usage exceeds the budget", () => {
    const e = makeEnforcer({ usage: { promptTokens: 400, completionTokens: 200 } });
    expect(() =>
      e.enforce("api_call", ctx({ resourceLimits: { maxTokensPerDay: 500 } }))
    ).toThrow("exhausted");
  });

  it("tolerates a null/partial usage reading", () => {
    const e = makeEnforcer({ usage: null });
    expect(() => e.enforce("api_call", ctx({ resourceLimits: limit }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Hourly request rate gate
// ---------------------------------------------------------------------------

describe("Hourly request rate gate", () => {
  it("passes unbounded when no rate limit is set", () => {
    const e = makeEnforcer();
    for (let i = 0; i < 100; i++) expect(() => e.enforce("api_call", ctx())).not.toThrow();
  });

  it("allows requests up to the limit then blocks", () => {
    const e = makeEnforcer();
    const c = ctx({ resourceLimits: { maxRequestsPerHour: 2 } });
    expect(() => e.enforce("api_call", c)).not.toThrow(); // 1
    expect(() => e.enforce("api_call", c)).not.toThrow(); // 2
    expect(() => e.enforce("api_call", c)).toThrow("Hourly request limit reached");
    expect(() => e.enforce("api_call", c)).toThrow("2 req/h");
  });

  it("resets the counter after a new hour window", () => {
    let t = 1_000_000;
    const e = makeEnforcer({ now: () => t });
    const c = ctx({ resourceLimits: { maxRequestsPerHour: 2 } });
    e.enforce("api_call", c); // 1
    e.enforce("api_call", c); // 2
    expect(() => e.enforce("api_call", c)).toThrow("Hourly request limit reached");

    t += 3601 * 1000; // advance > 1h
    expect(() => e.enforce("api_call", c)).not.toThrow(); // fresh window
  });

  it("includes a reset countdown in the error", () => {
    const t = Date.now();
    const e = makeEnforcer({ now: () => t });
    const c = ctx({ resourceLimits: { maxRequestsPerHour: 1 } });
    e.enforce("api_call", c);
    expect(() => e.enforce("api_call", c)).toThrow(/resets in \d+s/);
  });
});

// ---------------------------------------------------------------------------
// Gate ordering
// ---------------------------------------------------------------------------

describe("Gate ordering", () => {
  it("capability fires before expiry", () => {
    const e = makeEnforcer();
    const c = ctx({
      capabilities: [],
      policyExpiresAt: new Date(Date.now() - 1).toISOString(),
    });
    expect(() => e.enforce("api_call", c)).toThrow("not granted");
  });

  it("expiry fires before token budget", () => {
    const e = makeEnforcer({ usage: { promptTokens: 1, completionTokens: 0 } });
    const c = ctx({
      policyExpiresAt: new Date(Date.now() - 1).toISOString(),
      resourceLimits: { maxTokensPerDay: 0 },
    });
    expect(() => e.enforce("api_call", c)).toThrow("expired");
  });

  it("token budget fires before rate limit", () => {
    const e = makeEnforcer({ usage: { promptTokens: 1, completionTokens: 0 } });
    const c = ctx({ resourceLimits: { maxTokensPerDay: 0, maxRequestsPerHour: 100 } });
    expect(() => e.enforce("api_call", c)).toThrow("budget exhausted");
  });

  it("passes when everything is within bounds", () => {
    const e = makeEnforcer({ usage: { promptTokens: 200, completionTokens: 200 } });
    const c = ctx({
      policyExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      resourceLimits: { maxTokensPerDay: 1000, maxRequestsPerHour: 10 },
    });
    expect(() => e.enforce("api_call", c)).not.toThrow();
  });

  it("null resourceLimits bypasses both token and rate gates", () => {
    const e = makeEnforcer({ usage: { promptTokens: 9e6, completionTokens: 9e6 } });
    for (let i = 0; i < 50; i++)
      expect(() => e.enforce("api_call", ctx({ resourceLimits: null }))).not.toThrow();
  });
});
