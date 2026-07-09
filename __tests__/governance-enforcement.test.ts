/**
 * Tests for agent-side cert-metadata reading (handleAuthComplete /
 * handleUpdateCapabilities).
 *
 * The runtime enforcement gates themselves (capability, policy expiry, daily
 * token budget, hourly request rate) now live in the `@vaultysclaw/policy`
 * package and are unit-tested there against the real `PolicyEnforcer` — see
 * `packages/policy/__tests__/enforcer.test.ts`. This file keeps only the
 * cert-metadata parsing that still lives in the agent (base-agent.ts), verified
 * via small helpers that mirror that logic.
 *
 * Covered cases:
 *   - handleUpdateCapabilities: resourceLimits stored from payload
 *   - handleUpdateCapabilities: null clears existing limits
 *   - Cert metadata: native types read correctly (no JSON.parse needed)
 *   - Cert metadata: legacy JSON-stringified capabilities still read correctly
 */

import { describe, it, expect } from "vitest";
import type { ResourceLimits, AgentCapability } from "@vaultysclaw/shared";

// ---------------------------------------------------------------------------
// CapabilityReader — mirrors handleAuthComplete cert metadata reading
// ---------------------------------------------------------------------------

/**
 * Mirrors the cert-metadata reading done in agent.ts handleAuthComplete
 * and handleUpdateCapabilities.
 */
function readCapabilitiesFromMeta(
  pk2: Record<string, unknown>
): AgentCapability[] {
  const metaCaps = pk2?.capabilities;
  if (Array.isArray(metaCaps)) return metaCaps as AgentCapability[];
  if (typeof metaCaps === "string")
    return JSON.parse(metaCaps) as AgentCapability[];
  return [];
}

function readPolicyMetaFromCert(pk2: Record<string, unknown>): {
  resourceLimits: ResourceLimits | null;
  policyId: string | null;
  policyExpiresAt: string | null;
} {
  return {
    resourceLimits:
      (pk2.resourceLimits as ResourceLimits | null | undefined) ?? null,
    policyId: (pk2.policyId as string | null | undefined) ?? null,
    policyExpiresAt: (pk2.policyExpiresAt as string | null | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests: handleUpdateCapabilities metadata storage
// ---------------------------------------------------------------------------

describe("handleUpdateCapabilities policy metadata storage", () => {
  it("stores resourceLimits from payload", () => {
    // Mirrors: if (payload.resourceLimits !== undefined) this.resourceLimits = payload.resourceLimits ?? null;
    const agent = { resourceLimits: null as ResourceLimits | null };
    const payload = {
      capabilities: ["api_call"] as AgentCapability[],
      resourceLimits: { maxTokensPerDay: 5000 },
    };
    if (payload.resourceLimits !== undefined)
      agent.resourceLimits = payload.resourceLimits ?? null;
    expect(agent.resourceLimits).toEqual({ maxTokensPerDay: 5000 });
  });

  it("clears resourceLimits when payload sends null", () => {
    const agent = {
      resourceLimits: { maxTokensPerDay: 1000 } as ResourceLimits | null,
    };
    const payload = {
      capabilities: [] as AgentCapability[],
      resourceLimits: null as ResourceLimits | null,
    };
    if (payload.resourceLimits !== undefined)
      agent.resourceLimits = payload.resourceLimits ?? null;
    expect(agent.resourceLimits).toBeNull();
  });

  it("leaves resourceLimits unchanged when field is absent from payload", () => {
    const agent = {
      resourceLimits: { maxTokensPerDay: 999 } as ResourceLimits | null,
    };
    const payload = { capabilities: [] as AgentCapability[] }; // no resourceLimits key
    if ((payload as any).resourceLimits !== undefined)
      agent.resourceLimits = (payload as any).resourceLimits ?? null;
    expect(agent.resourceLimits).toEqual({ maxTokensPerDay: 999 });
  });
});

// ---------------------------------------------------------------------------
// Tests: cert metadata reading (handleAuthComplete)
// ---------------------------------------------------------------------------

describe("Cert metadata reading", () => {
  describe("readCapabilitiesFromMeta", () => {
    it("reads a native array directly", () => {
      const caps = readCapabilitiesFromMeta({
        capabilities: ["api_call", "file_access"],
      });
      expect(caps).toEqual(["api_call", "file_access"]);
    });

    it("parses a legacy JSON-stringified string", () => {
      const caps = readCapabilitiesFromMeta({
        capabilities: JSON.stringify(["api_call", "internet_access"]),
      });
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
      expect(meta.resourceLimits).toEqual({
        maxTokensPerDay: 2000,
        maxRequestsPerHour: 30,
      });
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
      expect(meta.resourceLimits?.allowedDomains).toEqual([
        "api.openai.com",
        "example.com",
      ]);
    });

    it("treats explicit null values as null (not undefined)", () => {
      const pk2 = { resourceLimits: null, policyId: null };
      const meta = readPolicyMetaFromCert(pk2);
      expect(meta.resourceLimits).toBeNull();
      expect(meta.policyId).toBeNull();
    });
  });
});
