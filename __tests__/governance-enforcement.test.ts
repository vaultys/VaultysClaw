/**
 * Tests for agent-side policy enforcement logic (cert-embedded resource limits).
 *
 * The full Agent class has heavy dependencies (WebSocket, VaultysId, fs, etc.)
 * so we test the enforcement rules by extracting them into a small helper class
 * that mirrors the exact logic in agent.ts — same approach used by
 * agent-approvals.test.ts.
 *
 * Covered cases:
 *   - Policy expiry: intents blocked after policyExpiresAt
 *   - Policy expiry: intents allowed before policyExpiresAt
 *   - Daily token budget: intents blocked when budget exhausted
 *   - Daily token budget: intents allowed while under budget
 *   - Hourly request rate: intents blocked when rate exceeded
 *   - Hourly request rate: counter resets after a new hour window
 *   - Hourly request rate: counter increments on each successful pass
 *   - No limits: intents always pass when resourceLimits is null
 *   - Partial limits: only the configured dimensions are enforced
 *   - handleUpdateCapabilities: resourceLimits stored from payload
 *   - handleUpdateCapabilities: null clears existing limits
 *   - Cert metadata: native types read correctly (no JSON.parse needed)
 *   - Cert metadata: legacy JSON-stringified capabilities still read correctly
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ResourceLimits, AgentCapability } from "@vaultysclaw/shared";

// ---------------------------------------------------------------------------
// PolicyEnforcer — mirrors the enforcement logic in agent.ts handleIntent
// ---------------------------------------------------------------------------

interface DailyUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Minimal re-implementation of the three policy gates in agent.ts handleIntent.
 * Throws the same error messages so callers can match on them.
 */
class PolicyEnforcer {
  resourceLimits: ResourceLimits | null = null;
  policyId: string | null = null;
  policyExpiresAt: string | null = null;

  private _requestsThisHour = { count: 0, hourStart: 0 };

  /** Simulates the token-usage DB query. */
  getDailyUsage: () => DailyUsage = () => ({ promptTokens: 0, completionTokens: 0 });

  /** Simulates Date.now() so we can control time in tests. */
  now: () => number = () => Date.now();

  /**
   * Run all policy gates. Throws if any gate rejects.
   * Returns "passed" on success (mirrors that execution would continue).
   */
  check(): "passed" {
    // 1. Policy expiry
    if (this.policyExpiresAt) {
      const expiry = new Date(this.policyExpiresAt).getTime();
      if (!isNaN(expiry) && this.now() > expiry) {
        throw new Error(`Policy '${this.policyId ?? "unknown"}' has expired — action blocked`);
      }
    }

    // 2. Daily token budget
    if (this.resourceLimits?.maxTokensPerDay != null) {
      const daily = this.getDailyUsage();
      const usedToday = (daily?.promptTokens ?? 0) + (daily?.completionTokens ?? 0);
      if (usedToday >= this.resourceLimits.maxTokensPerDay) {
        throw new Error(
          `Daily token budget exhausted (used ${usedToday} / limit ${this.resourceLimits.maxTokensPerDay})`
        );
      }
    }

    // 3. Hourly request rate
    if (this.resourceLimits?.maxRequestsPerHour != null) {
      const now = this.now();
      const hourMs = 60 * 60 * 1000;
      if (now - this._requestsThisHour.hourStart > hourMs) {
        this._requestsThisHour = { count: 0, hourStart: now };
      }
      if (this._requestsThisHour.count >= this.resourceLimits.maxRequestsPerHour) {
        const resetIn = Math.ceil((this._requestsThisHour.hourStart + hourMs - now) / 1000);
        throw new Error(
          `Hourly request limit reached (${this.resourceLimits.maxRequestsPerHour} req/h) — resets in ${resetIn}s`
        );
      }
      this._requestsThisHour.count++;
    }

    return "passed";
  }

  /** Expose counter for assertions. */
  get requestCount() { return this._requestsThisHour.count; }

  /** Directly set the hour window (for rate-limit reset tests). */
  setHourWindow(count: number, hourStart: number) {
    this._requestsThisHour = { count, hourStart };
  }
}

// ---------------------------------------------------------------------------
// CapabilityReader — mirrors handleAuthComplete cert metadata reading
// ---------------------------------------------------------------------------

/**
 * Mirrors the cert-metadata reading done in agent.ts handleAuthComplete
 * and handleUpdateCapabilities.
 */
function readCapabilitiesFromMeta(pk2: Record<string, unknown>): AgentCapability[] {
  const metaCaps = pk2?.capabilities;
  if (Array.isArray(metaCaps)) return metaCaps as AgentCapability[];
  if (typeof metaCaps === "string") return JSON.parse(metaCaps) as AgentCapability[];
  return [];
}

function readPolicyMetaFromCert(pk2: Record<string, unknown>): {
  resourceLimits: ResourceLimits | null;
  policyId: string | null;
  policyExpiresAt: string | null;
} {
  return {
    resourceLimits: (pk2.resourceLimits as ResourceLimits | null | undefined) ?? null,
    policyId: (pk2.policyId as string | null | undefined) ?? null,
    policyExpiresAt: (pk2.policyExpiresAt as string | null | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests: policy expiry
// ---------------------------------------------------------------------------

describe("Policy expiry gate", () => {
  let enforcer: PolicyEnforcer;
  beforeEach(() => { enforcer = new PolicyEnforcer(); });

  it("passes when no policyExpiresAt is set", () => {
    expect(enforcer.check()).toBe("passed");
  });

  it("passes when policyExpiresAt is in the future", () => {
    enforcer.policyExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    expect(enforcer.check()).toBe("passed");
  });

  it("blocks when policyExpiresAt is in the past", () => {
    enforcer.policyId = "pol-abc";
    enforcer.policyExpiresAt = new Date(Date.now() - 1).toISOString();
    expect(() => enforcer.check()).toThrow("expired");
    expect(() => enforcer.check()).toThrow("pol-abc");
  });

  it("includes 'unknown' in message when policyId is null", () => {
    enforcer.policyExpiresAt = new Date(Date.now() - 1).toISOString();
    expect(() => enforcer.check()).toThrow("unknown");
  });

  it("uses a controllable clock", () => {
    const expiry = 1_000_000;
    enforcer.policyExpiresAt = new Date(expiry).toISOString();
    enforcer.now = () => expiry - 1; // just before expiry
    expect(enforcer.check()).toBe("passed");
    enforcer.now = () => expiry + 1; // just after expiry
    expect(() => enforcer.check()).toThrow("expired");
  });
});

// ---------------------------------------------------------------------------
// Tests: daily token budget
// ---------------------------------------------------------------------------

describe("Daily token budget gate", () => {
  let enforcer: PolicyEnforcer;
  beforeEach(() => { enforcer = new PolicyEnforcer(); });

  it("passes when no maxTokensPerDay is set", () => {
    enforcer.resourceLimits = { maxRequestsPerHour: 10 }; // only rate limit, no token limit
    enforcer.getDailyUsage = () => ({ promptTokens: 999_999, completionTokens: 999_999 });
    expect(enforcer.check()).toBe("passed");
  });

  it("passes when usage is below the budget", () => {
    enforcer.resourceLimits = { maxTokensPerDay: 1000 };
    enforcer.getDailyUsage = () => ({ promptTokens: 400, completionTokens: 400 });
    expect(enforcer.check()).toBe("passed");
  });

  it("passes when usage exactly equals budget minus one", () => {
    enforcer.resourceLimits = { maxTokensPerDay: 1000 };
    enforcer.getDailyUsage = () => ({ promptTokens: 500, completionTokens: 499 });
    expect(enforcer.check()).toBe("passed");
  });

  it("blocks when usage equals the budget", () => {
    enforcer.resourceLimits = { maxTokensPerDay: 1000 };
    enforcer.getDailyUsage = () => ({ promptTokens: 600, completionTokens: 400 });
    expect(() => enforcer.check()).toThrow("Daily token budget exhausted");
    expect(() => enforcer.check()).toThrow("1000 / limit 1000");
  });

  it("blocks when usage exceeds the budget", () => {
    enforcer.resourceLimits = { maxTokensPerDay: 500 };
    enforcer.getDailyUsage = () => ({ promptTokens: 400, completionTokens: 200 });
    expect(() => enforcer.check()).toThrow("exhausted");
  });

  it("includes used/limit figures in the error message", () => {
    enforcer.resourceLimits = { maxTokensPerDay: 100 };
    enforcer.getDailyUsage = () => ({ promptTokens: 70, completionTokens: 40 });
    let msg = "";
    try { enforcer.check(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain("110");  // 70 + 40
    expect(msg).toContain("100");  // limit
  });
});

// ---------------------------------------------------------------------------
// Tests: hourly request rate
// ---------------------------------------------------------------------------

describe("Hourly request rate gate", () => {
  let enforcer: PolicyEnforcer;
  beforeEach(() => { enforcer = new PolicyEnforcer(); });

  it("passes when no maxRequestsPerHour is set", () => {
    for (let i = 0; i < 100; i++) expect(enforcer.check()).toBe("passed");
  });

  it("allows requests up to the limit", () => {
    enforcer.resourceLimits = { maxRequestsPerHour: 3 };
    expect(enforcer.check()).toBe("passed"); // 1
    expect(enforcer.check()).toBe("passed"); // 2
    expect(enforcer.check()).toBe("passed"); // 3
  });

  it("blocks the request that would exceed the limit", () => {
    enforcer.resourceLimits = { maxRequestsPerHour: 2 };
    enforcer.check(); // 1
    enforcer.check(); // 2
    expect(() => enforcer.check()).toThrow("Hourly request limit reached");
    expect(() => enforcer.check()).toThrow("2 req/h");
  });

  it("increments the counter on each successful pass", () => {
    enforcer.resourceLimits = { maxRequestsPerHour: 10 };
    enforcer.check();
    enforcer.check();
    enforcer.check();
    expect(enforcer.requestCount).toBe(3);
  });

  it("resets the counter after a new hour window", () => {
    enforcer.resourceLimits = { maxRequestsPerHour: 2 };
    const baseTime = 1_000_000;
    enforcer.now = () => baseTime;
    enforcer.check(); // 1
    enforcer.check(); // 2
    expect(() => enforcer.check()).toThrow("Hourly request limit reached");

    // Advance time by more than one hour
    const newTime = baseTime + 3601 * 1000;
    enforcer.now = () => newTime;
    expect(enforcer.check()).toBe("passed"); // fresh window
    expect(enforcer.requestCount).toBe(1);
  });

  it("includes reset countdown in the error message", () => {
    enforcer.resourceLimits = { maxRequestsPerHour: 1 };
    const baseTime = Date.now();
    enforcer.now = () => baseTime;
    enforcer.check();
    let msg = "";
    try { enforcer.check(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/resets in \d+s/);
  });
});

// ---------------------------------------------------------------------------
// Tests: combined limits
// ---------------------------------------------------------------------------

describe("Combined policy limits", () => {
  let enforcer: PolicyEnforcer;
  beforeEach(() => { enforcer = new PolicyEnforcer(); });

  it("expiry gate fires before token budget gate", () => {
    enforcer.policyExpiresAt = new Date(Date.now() - 1).toISOString();
    enforcer.resourceLimits = { maxTokensPerDay: 0 }; // would also fail
    enforcer.getDailyUsage = () => ({ promptTokens: 1, completionTokens: 0 });
    expect(() => enforcer.check()).toThrow("expired"); // expiry is first
  });

  it("token budget gate fires before rate gate", () => {
    enforcer.resourceLimits = { maxTokensPerDay: 0, maxRequestsPerHour: 100 };
    enforcer.getDailyUsage = () => ({ promptTokens: 1, completionTokens: 0 });
    expect(() => enforcer.check()).toThrow("budget exhausted"); // budget is second
  });

  it("passes when all limits are within bounds", () => {
    enforcer.policyExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    enforcer.resourceLimits = { maxTokensPerDay: 1000, maxRequestsPerHour: 10 };
    enforcer.getDailyUsage = () => ({ promptTokens: 200, completionTokens: 200 });
    expect(enforcer.check()).toBe("passed");
  });

  it("null resourceLimits bypasses both token and rate gates", () => {
    enforcer.resourceLimits = null;
    enforcer.getDailyUsage = () => ({ promptTokens: 999_999, completionTokens: 999_999 });
    for (let i = 0; i < 50; i++) expect(enforcer.check()).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// Tests: handleUpdateCapabilities metadata storage
// ---------------------------------------------------------------------------

describe("handleUpdateCapabilities policy metadata storage", () => {
  it("stores resourceLimits from payload", () => {
    // Mirrors: if (payload.resourceLimits !== undefined) this.resourceLimits = payload.resourceLimits ?? null;
    const agent = { resourceLimits: null as ResourceLimits | null };
    const payload = { capabilities: ["api_call"] as AgentCapability[], resourceLimits: { maxTokensPerDay: 5000 } };
    if (payload.resourceLimits !== undefined) agent.resourceLimits = payload.resourceLimits ?? null;
    expect(agent.resourceLimits).toEqual({ maxTokensPerDay: 5000 });
  });

  it("clears resourceLimits when payload sends null", () => {
    const agent = { resourceLimits: { maxTokensPerDay: 1000 } as ResourceLimits | null };
    const payload = { capabilities: [] as AgentCapability[], resourceLimits: null as ResourceLimits | null };
    if (payload.resourceLimits !== undefined) agent.resourceLimits = payload.resourceLimits ?? null;
    expect(agent.resourceLimits).toBeNull();
  });

  it("leaves resourceLimits unchanged when field is absent from payload", () => {
    const agent = { resourceLimits: { maxTokensPerDay: 999 } as ResourceLimits | null };
    const payload = { capabilities: [] as AgentCapability[] }; // no resourceLimits key
    if ((payload as any).resourceLimits !== undefined) agent.resourceLimits = (payload as any).resourceLimits ?? null;
    expect(agent.resourceLimits).toEqual({ maxTokensPerDay: 999 });
  });
});

// ---------------------------------------------------------------------------
// Tests: cert metadata reading (handleAuthComplete)
// ---------------------------------------------------------------------------

describe("Cert metadata reading", () => {
  describe("readCapabilitiesFromMeta", () => {
    it("reads a native array directly", () => {
      const caps = readCapabilitiesFromMeta({ capabilities: ["api_call", "file_access"] });
      expect(caps).toEqual(["api_call", "file_access"]);
    });

    it("parses a legacy JSON-stringified string", () => {
      const caps = readCapabilitiesFromMeta({ capabilities: JSON.stringify(["api_call", "internet_access"]) });
      expect(caps).toEqual(["api_call", "internet_access"]);
    });

    it("returns empty array when capabilities is absent", () => {
      expect(readCapabilitiesFromMeta({})).toEqual([]);
    });
  });

  describe("readPolicyMetaFromCert", () => {
    it("reads all three fields as native types", () => {
      const pk2 = {
        resourceLimits: { maxTokensPerDay: 2000, maxRequestsPerHour: 30 },
        policyId: "pol-xyz",
        policyExpiresAt: "2030-01-01T00:00:00.000Z",
      };
      const meta = readPolicyMetaFromCert(pk2);
      expect(meta.resourceLimits).toEqual({ maxTokensPerDay: 2000, maxRequestsPerHour: 30 });
      expect(meta.policyId).toBe("pol-xyz");
      expect(meta.policyExpiresAt).toBe("2030-01-01T00:00:00.000Z");
    });

    it("returns nulls when all governance fields are absent", () => {
      const meta = readPolicyMetaFromCert({ capabilities: ["api_call"] });
      expect(meta.resourceLimits).toBeNull();
      expect(meta.policyId).toBeNull();
      expect(meta.policyExpiresAt).toBeNull();
    });

    it("returns null for individual absent fields", () => {
      const meta = readPolicyMetaFromCert({ policyId: "pol-only" });
      expect(meta.policyId).toBe("pol-only");
      expect(meta.resourceLimits).toBeNull();
      expect(meta.policyExpiresAt).toBeNull();
    });

    it("preserves allowedDomains inside resourceLimits (native array)", () => {
      const pk2 = {
        resourceLimits: { allowedDomains: ["api.openai.com", "example.com"] },
      };
      const meta = readPolicyMetaFromCert(pk2);
      expect(meta.resourceLimits?.allowedDomains).toEqual(["api.openai.com", "example.com"]);
    });

    it("treats explicit null values as null (not undefined)", () => {
      const pk2 = { resourceLimits: null, policyId: null };
      const meta = readPolicyMetaFromCert(pk2);
      expect(meta.resourceLimits).toBeNull();
      expect(meta.policyId).toBeNull();
    });
  });
});
