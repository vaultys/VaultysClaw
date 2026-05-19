/**
 * Tests for governance policy DB helpers:
 *   - createPolicy persists a record with correct fields
 *   - createPolicy stores resourceLimits as JSON
 *   - getPolicy fetches by id; returns undefined for missing ids
 *   - listPolicies filters by agentDid, realmId
 *   - listPolicies excludes expired policies by default
 *   - listPolicies includes expired policies when includeExpired=true
 *   - deletePolicy removes the record and returns false for missing ids
 *   - countPoliciesByAgent groups non-expired policies correctly
 *   - updateAgentBudget writes token budget columns
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  getDb,
  closeDb,
  createPolicy,
  listPolicies,
  getPolicy,
  deletePolicy,
  countPoliciesByAgent,
  updateAgentBudget,
  upsertAgent,
  createRealm,
} from "../packages/control-plane/lib/db";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const AGENT_DID = "did:vaultys:gov-test-agent";
const AGENT_DID_2 = "did:vaultys:gov-test-agent-2";
const REALM_SLUG = "gov-test-realm";
let REALM_ID: string;

beforeAll(() => {
  const db = getDb();
  // Ensure agent rows exist (required for updateAgentBudget FK)
  upsertAgent({ did: AGENT_DID, name: "GovernanceTestAgent", capabilities: ["api_call"] });
  upsertAgent({ did: AGENT_DID_2, name: "GovernanceTestAgent2", capabilities: ["file_access"] });
  // Ensure a realm row exists (policies.realm_id has a FK constraint)
  const existing = db.prepare("SELECT id FROM realms WHERE slug = ?").get(REALM_SLUG) as { id: string } | undefined;
  if (existing) {
    REALM_ID = existing.id;
  } else {
    const realm = createRealm({ name: "Gov Test Realm", slug: REALM_SLUG });
    REALM_ID = realm.id;
  }
  // Clean slate
  db.prepare("DELETE FROM policies WHERE agent_did IN (?, ?) OR realm_id = ?").run(AGENT_DID, AGENT_DID_2, REALM_ID);
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  getDb().prepare("DELETE FROM policies WHERE agent_did IN (?, ?) OR realm_id = ?").run(AGENT_DID, AGENT_DID_2, REALM_ID);
});

// ---------------------------------------------------------------------------
// createPolicy
// ---------------------------------------------------------------------------

describe("createPolicy", () => {
  it("persists a minimal policy (no limits, no expiry)", () => {
    const p = createPolicy({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      createdBy: "admin",
    });

    expect(p.id).toMatch(/^policy-/);
    expect(p.agent_did).toBe(AGENT_DID);
    expect(p.realm_id).toBeNull();
    expect(JSON.parse(p.capabilities)).toEqual(["api_call"]);
    expect(p.resource_limits).toBeNull();
    expect(p.expires_at).toBeNull();
    expect(p.created_by).toBe("admin");
    expect(p.created_at).toBeTruthy();
  });

  it("persists resourceLimits as a JSON string", () => {
    const limits = { maxTokensPerDay: 5000, maxRequestsPerHour: 20 };
    const p = createPolicy({
      agentDid: AGENT_DID,
      capabilities: ["api_call", "internet_access"],
      resourceLimits: limits,
    });

    expect(p.resource_limits).not.toBeNull();
    expect(JSON.parse(p.resource_limits!)).toEqual(limits);
  });

  it("persists allowedDomains inside resourceLimits", () => {
    const limits = { allowedDomains: ["example.com", "api.github.com"] };
    const p = createPolicy({
      agentDid: AGENT_DID,
      capabilities: ["internet_access"],
      resourceLimits: limits,
    });
    expect(JSON.parse(p.resource_limits!).allowedDomains).toEqual(["example.com", "api.github.com"]);
  });

  it("persists expiresAt when supplied", () => {
    const exp = new Date(Date.now() + 3600 * 1000).toISOString();
    const p = createPolicy({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      expiresAt: exp,
    });
    expect(p.expires_at).toBe(exp);
  });

  it("persists a realm-scoped policy (no agentDid)", () => {
    const p = createPolicy({
      realmId: REALM_ID,
      capabilities: ["file_access"],
    });
    expect(p.agent_did).toBeNull();
    expect(p.realm_id).toBe(REALM_ID);
  });

  it("generates a unique id for each policy", () => {
    const p1 = createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    const p2 = createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    expect(p1.id).not.toBe(p2.id);
  });
});

// ---------------------------------------------------------------------------
// getPolicy
// ---------------------------------------------------------------------------

describe("getPolicy", () => {
  it("retrieves a policy by id", () => {
    const created = createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    const fetched = getPolicy(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
  });

  it("returns undefined for a non-existent id", () => {
    expect(getPolicy("policy-does-not-exist")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deletePolicy
// ---------------------------------------------------------------------------

describe("deletePolicy", () => {
  it("removes an existing policy and returns true", () => {
    const p = createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    expect(deletePolicy(p.id)).toBe(true);
    expect(getPolicy(p.id)).toBeUndefined();
  });

  it("returns false when the policy does not exist", () => {
    expect(deletePolicy("policy-ghost")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listPolicies
// ---------------------------------------------------------------------------

describe("listPolicies", () => {
  it("returns all non-expired policies when no filter given", () => {
    createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    createPolicy({ agentDid: AGENT_DID_2, capabilities: ["file_access"] });
    const all = listPolicies();
    const dids = all.map((p) => p.agent_did);
    expect(dids).toContain(AGENT_DID);
    expect(dids).toContain(AGENT_DID_2);
  });

  it("filters by agentDid", () => {
    createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    createPolicy({ agentDid: AGENT_DID_2, capabilities: ["file_access"] });
    const rows = listPolicies({ agentDid: AGENT_DID });
    expect(rows.every((p) => p.agent_did === AGENT_DID)).toBe(true);
  });

  it("filters by realmId", () => {
    createPolicy({ realmId: REALM_ID, capabilities: ["api_call"] });
    createPolicy({ agentDid: AGENT_DID, capabilities: ["file_access"] });
    const rows = listPolicies({ realmId: REALM_ID });
    expect(rows.every((p) => p.realm_id === REALM_ID)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes expired policies by default", () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    const p = createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"], expiresAt: pastExpiry });
    const rows = listPolicies({ agentDid: AGENT_DID });
    expect(rows.find((r) => r.id === p.id)).toBeUndefined();
  });

  it("includes expired policies when includeExpired=true", () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const p = createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"], expiresAt: pastExpiry });
    const rows = listPolicies({ agentDid: AGENT_DID, includeExpired: true });
    expect(rows.find((r) => r.id === p.id)).toBeDefined();
  });

  it("includes non-expired policies regardless of includeExpired flag", () => {
    const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
    const p = createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"], expiresAt: futureExpiry });
    const rows = listPolicies({ agentDid: AGENT_DID });
    expect(rows.find((r) => r.id === p.id)).toBeDefined();
  });

  it("returns results ordered by created_at DESC", () => {
    createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    createPolicy({ agentDid: AGENT_DID, capabilities: ["file_access"] });
    const rows = listPolicies({ agentDid: AGENT_DID });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Each row should have a created_at ≥ the next row's
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].created_at >= rows[i + 1].created_at).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// countPoliciesByAgent
// ---------------------------------------------------------------------------

describe("countPoliciesByAgent", () => {
  it("counts active policies grouped by agent_did", () => {
    createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    createPolicy({ agentDid: AGENT_DID, capabilities: ["internet_access"] });
    createPolicy({ agentDid: AGENT_DID_2, capabilities: ["file_access"] });

    const counts = countPoliciesByAgent();
    const row1 = counts.find((r) => r.agent_did === AGENT_DID);
    const row2 = counts.find((r) => r.agent_did === AGENT_DID_2);
    expect(row1).toBeDefined();
    expect(row1!.count).toBeGreaterThanOrEqual(2);
    expect(row2).toBeDefined();
    expect(row2!.count).toBeGreaterThanOrEqual(1);
  });

  it("does not count expired policies", () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    createPolicy({ agentDid: AGENT_DID, capabilities: ["api_call"], expiresAt: pastExpiry });

    const counts = countPoliciesByAgent();
    const row = counts.find((r) => r.agent_did === AGENT_DID);
    // If there are only expired policies for this agent, it should not appear
    if (row) {
      // Any count here must be from non-expired rows
      const active = listPolicies({ agentDid: AGENT_DID });
      expect(row.count).toBe(active.length);
    }
  });

  it("does not include realm-only policies (agent_did IS NULL)", () => {
    createPolicy({ realmId: REALM_ID, capabilities: ["api_call"] });
    const counts = countPoliciesByAgent();
    expect(counts.every((r) => r.agent_did !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateAgentBudget
// ---------------------------------------------------------------------------

describe("updateAgentBudget", () => {
  it("sets token_budget_daily on an existing agent", () => {
    updateAgentBudget(AGENT_DID, { tokenBudgetDaily: 10_000 });
    const db = getDb();
    const row = db.prepare("SELECT token_budget_daily FROM agents WHERE did = ?").get(AGENT_DID) as { token_budget_daily: number | null };
    expect(row?.token_budget_daily).toBe(10_000);
  });

  it("sets token_budget_monthly on an existing agent", () => {
    updateAgentBudget(AGENT_DID, { tokenBudgetMonthly: 200_000 });
    const db = getDb();
    const row = db.prepare("SELECT token_budget_monthly FROM agents WHERE did = ?").get(AGENT_DID) as { token_budget_monthly: number | null };
    expect(row?.token_budget_monthly).toBe(200_000);
  });

  it("clears a budget by setting it to null", () => {
    updateAgentBudget(AGENT_DID, { tokenBudgetDaily: 5000 });
    updateAgentBudget(AGENT_DID, { tokenBudgetDaily: null });
    const db = getDb();
    const row = db.prepare("SELECT token_budget_daily FROM agents WHERE did = ?").get(AGENT_DID) as { token_budget_daily: number | null };
    expect(row?.token_budget_daily).toBeNull();
  });

  it("is a no-op when the updates object is empty", () => {
    // Should not throw — an empty update is silently ignored
    expect(() => updateAgentBudget(AGENT_DID, {})).not.toThrow();
  });

  it("sets both daily and monthly in a single call", () => {
    updateAgentBudget(AGENT_DID, { tokenBudgetDaily: 1000, tokenBudgetMonthly: 30_000 });
    const db = getDb();
    const row = db.prepare("SELECT token_budget_daily, token_budget_monthly FROM agents WHERE did = ?").get(AGENT_DID) as { token_budget_daily: number; token_budget_monthly: number };
    expect(row.token_budget_daily).toBe(1000);
    expect(row.token_budget_monthly).toBe(30_000);
  });
});
