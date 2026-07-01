/**
 * Tests for governance policy DB helpers:
 *   - PolicyDAO.create persists a record with correct fields
 *   - PolicyDAO.create stores resourceLimits as object
 *   - PolicyDAO.findById fetches by id; returns null for missing ids
 *   - PolicyDAO.list filters by agentDid, workspaceId
 *   - PolicyDAO.list excludes expired policies by default
 *   - PolicyDAO.list includes expired policies when includeExpired=true
 *   - PolicyDAO.delete removes the record and returns false for missing ids
 *   - PolicyDAO.countByAgent groups non-expired policies correctly
 *   - AgentDAO.updateBudget writes token budget columns
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PolicyDAO, AgentDAO, WorkspaceDAO } from "../packages/control-plane/db";
import { prisma } from "../packages/control-plane/db/client";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const AGENT_DID = "did:vaultys:gov-test-agent";
const AGENT_DID_2 = "did:vaultys:gov-test-agent-2";
const WORKSPACE_SLUG = "gov-test-workspace";
let WORKSPACE_ID: string;

beforeAll(async () => {
  // Ensure agent rows exist (required for updateBudget FK)
  await prisma.agent.upsert({
    where: { did: AGENT_DID },
    create: { did: AGENT_DID, name: "GovernanceTestAgent", capabilities: ["api_call"] },
    update: {},
  });
  await prisma.agent.upsert({
    where: { did: AGENT_DID_2 },
    create: { did: AGENT_DID_2, name: "GovernanceTestAgent2", capabilities: ["file_access"] },
    update: {},
  });

  // Ensure a workspace row exists (policies.workspaceId has a FK constraint)
  const existing = await prisma.workspace.findFirst({ where: { slug: WORKSPACE_SLUG } });
  if (existing) {
    WORKSPACE_ID = existing.id;
  } else {
    const workspace = await WorkspaceDAO.create({ name: "Gov Test Workspace", slug: WORKSPACE_SLUG });
    WORKSPACE_ID = workspace.id;
  }

  // Clean slate
  await prisma.policy.deleteMany({
    where: { OR: [{ agentDid: AGENT_DID }, { agentDid: AGENT_DID_2 }, { workspaceId: WORKSPACE_ID }] },
  });
});

afterAll(async () => {
  await prisma.policy.deleteMany({
    where: { OR: [{ agentDid: AGENT_DID }, { agentDid: AGENT_DID_2 }, { workspaceId: WORKSPACE_ID }] },
  });
  await prisma.agent.deleteMany({ where: { did: { in: [AGENT_DID, AGENT_DID_2] } } });
  await prisma.workspace.deleteMany({ where: { slug: WORKSPACE_SLUG } });
});

beforeEach(async () => {
  await prisma.policy.deleteMany({
    where: { OR: [{ agentDid: AGENT_DID }, { agentDid: AGENT_DID_2 }, { workspaceId: WORKSPACE_ID }] },
  });
});

// ---------------------------------------------------------------------------
// PolicyDAO.create
// ---------------------------------------------------------------------------

describe("PolicyDAO.create", () => {
  it("persists a minimal policy (no limits, no expiry)", async () => {
    const p = await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      createdBy: "admin",
    });

    expect(p.id).toMatch(/^policy-/);
    expect(p.agentDid).toBe(AGENT_DID);
    expect(p.workspaceId).toBeNull();
    expect(p.capabilities).toEqual(["api_call"]);
    expect(p.resourceLimits).toBeNull();
    expect(p.expiresAt).toBeNull();
    expect(p.createdBy).toBe("admin");
    expect(p.createdAt).toBeTruthy();
  });

  it("persists resourceLimits as an object", async () => {
    const limits = { maxTokensPerDay: 5000, maxRequestsPerHour: 20 };
    const p = await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["api_call", "internet_access"],
      resourceLimits: limits,
    });

    expect(p.resourceLimits).not.toBeNull();
    expect(p.resourceLimits).toEqual(limits);
  });

  it("persists allowedDomains inside resourceLimits", async () => {
    const limits = { allowedDomains: ["example.com", "api.github.com"] };
    const p = await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["internet_access"],
      resourceLimits: limits,
    });
    expect((p.resourceLimits as any).allowedDomains).toEqual([
      "example.com",
      "api.github.com",
    ]);
  });

  it("persists expiresAt when supplied", async () => {
    const exp = new Date(Date.now() + 3600 * 1000).toISOString();
    const p = await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      expiresAt: exp,
    });
    expect(p.expiresAt).not.toBeNull();
    expect(new Date(p.expiresAt!).toISOString()).toBe(exp);
  });

  it("persists a workspace-scoped policy (no agentDid)", async () => {
    const p = await PolicyDAO.create({
      workspaceId: WORKSPACE_ID,
      capabilities: ["file_access"],
    });
    expect(p.agentDid).toBeNull();
    expect(p.workspaceId).toBe(WORKSPACE_ID);
  });

  it("generates a unique id for each policy", async () => {
    const p1 = await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    const p2 = await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    expect(p1.id).not.toBe(p2.id);
  });
});

// ---------------------------------------------------------------------------
// PolicyDAO.findById
// ---------------------------------------------------------------------------

describe("PolicyDAO.findById", () => {
  it("retrieves a policy by id", async () => {
    const created = await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    const fetched = await PolicyDAO.findById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
  });

  it("returns null for a non-existent id", async () => {
    expect(await PolicyDAO.findById("policy-does-not-exist")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PolicyDAO.delete
// ---------------------------------------------------------------------------

describe("PolicyDAO.delete", () => {
  it("removes an existing policy and returns true", async () => {
    const p = await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    expect(await PolicyDAO.delete(p.id)).toBe(true);
    expect(await PolicyDAO.findById(p.id)).toBeNull();
  });

  it("returns false when the policy does not exist", async () => {
    expect(await PolicyDAO.delete("policy-ghost")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PolicyDAO.list
// ---------------------------------------------------------------------------

describe("PolicyDAO.list", () => {
  it("returns all non-expired policies when no filter given", async () => {
    await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    await PolicyDAO.create({ agentDid: AGENT_DID_2, capabilities: ["file_access"] });
    const all = await PolicyDAO.list();
    const dids = all.map((p) => p.agentDid);
    expect(dids).toContain(AGENT_DID);
    expect(dids).toContain(AGENT_DID_2);
  });

  it("filters by agentDid", async () => {
    await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    await PolicyDAO.create({ agentDid: AGENT_DID_2, capabilities: ["file_access"] });
    const rows = await PolicyDAO.list({ agentDid: AGENT_DID });
    expect(rows.every((p) => p.agentDid === AGENT_DID)).toBe(true);
  });

  it("filters by workspaceId", async () => {
    await PolicyDAO.create({ workspaceId: WORKSPACE_ID, capabilities: ["api_call"] });
    await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["file_access"] });
    const rows = await PolicyDAO.list({ workspaceId: WORKSPACE_ID });
    expect(rows.every((p) => p.workspaceId === WORKSPACE_ID)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes expired policies by default", async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const p = await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      expiresAt: pastExpiry,
    });
    const rows = await PolicyDAO.list({ agentDid: AGENT_DID });
    expect(rows.find((r) => r.id === p.id)).toBeUndefined();
  });

  it("includes expired policies when includeExpired=true", async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const p = await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      expiresAt: pastExpiry,
    });
    const rows = await PolicyDAO.list({ agentDid: AGENT_DID, includeExpired: true });
    expect(rows.find((r) => r.id === p.id)).toBeDefined();
  });

  it("includes non-expired policies regardless of includeExpired flag", async () => {
    const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
    const p = await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      expiresAt: futureExpiry,
    });
    const rows = await PolicyDAO.list({ agentDid: AGENT_DID });
    expect(rows.find((r) => r.id === p.id)).toBeDefined();
  });

  it("returns results ordered by createdAt DESC", async () => {
    await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["file_access"] });
    const rows = await PolicyDAO.list({ agentDid: AGENT_DID });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Each row should have a createdAt >= the next row's
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].createdAt >= rows[i + 1].createdAt).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// PolicyDAO.countByAgent
// ---------------------------------------------------------------------------

describe("PolicyDAO.countByAgent", () => {
  it("counts active policies grouped by agentDid", async () => {
    await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["api_call"] });
    await PolicyDAO.create({ agentDid: AGENT_DID, capabilities: ["internet_access"] });
    await PolicyDAO.create({ agentDid: AGENT_DID_2, capabilities: ["file_access"] });

    const counts = await PolicyDAO.countByAgent();
    const row1 = counts.find((r) => r.agentDid === AGENT_DID);
    const row2 = counts.find((r) => r.agentDid === AGENT_DID_2);
    expect(row1).toBeDefined();
    expect(row1!.count).toBeGreaterThanOrEqual(2);
    expect(row2).toBeDefined();
    expect(row2!.count).toBeGreaterThanOrEqual(1);
  });

  it("does not count expired policies", async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    await PolicyDAO.create({
      agentDid: AGENT_DID,
      capabilities: ["api_call"],
      expiresAt: pastExpiry,
    });

    const counts = await PolicyDAO.countByAgent();
    const row = counts.find((r) => r.agentDid === AGENT_DID);
    if (row) {
      const active = await PolicyDAO.list({ agentDid: AGENT_DID });
      expect(row.count).toBe(active.length);
    }
  });

  it("does not include workspace-only policies (agentDid IS NULL)", async () => {
    await PolicyDAO.create({ workspaceId: WORKSPACE_ID, capabilities: ["api_call"] });
    const counts = await PolicyDAO.countByAgent();
    expect(counts.every((r) => r.agentDid !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AgentDAO.updateBudget
// ---------------------------------------------------------------------------

describe("AgentDAO.updateBudget", () => {
  it("sets tokenBudgetDaily on an existing agent", async () => {
    await AgentDAO.updateBudget(AGENT_DID, { tokenBudgetDaily: 10_000 });
    const agent = await prisma.agent.findUnique({ where: { did: AGENT_DID } });
    expect(agent?.tokenBudgetDaily).toBe(10_000);
  });

  it("sets tokenBudgetMonthly on an existing agent", async () => {
    await AgentDAO.updateBudget(AGENT_DID, { tokenBudgetMonthly: 200_000 });
    const agent = await prisma.agent.findUnique({ where: { did: AGENT_DID } });
    expect(agent?.tokenBudgetMonthly).toBe(200_000);
  });

  it("clears a budget by setting it to null", async () => {
    await AgentDAO.updateBudget(AGENT_DID, { tokenBudgetDaily: 5000 });
    await AgentDAO.updateBudget(AGENT_DID, { tokenBudgetDaily: null });
    const agent = await prisma.agent.findUnique({ where: { did: AGENT_DID } });
    expect(agent?.tokenBudgetDaily).toBeNull();
  });

  it("is a no-op when the updates object is empty", async () => {
    // Should not throw — an empty update is silently ignored
    await expect(AgentDAO.updateBudget(AGENT_DID, {})).resolves.not.toThrow();
  });

  it("sets both daily and monthly in a single call", async () => {
    await AgentDAO.updateBudget(AGENT_DID, {
      tokenBudgetDaily: 1000,
      tokenBudgetMonthly: 30_000,
    });
    const agent = await prisma.agent.findUnique({ where: { did: AGENT_DID } });
    expect(agent?.tokenBudgetDaily).toBe(1000);
    expect(agent?.tokenBudgetMonthly).toBe(30_000);
  });
});
