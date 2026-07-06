/**
 * Tests for the skills API layer:
 *   DB helpers: createWorkspaceSkill, updateWorkspaceSkill, deleteWorkspaceSkill,
 *               getWorkspaceSkillById, getAllSkillsWithWorkspaces, getAgentEffectiveSkills
 *   API routes:
 *     GET  /api/admin/skills          — list all skills with workspace info (admin only)
 *     POST /api/admin/skills          — create a skill for a workspace (admin only)
 *     GET  /api/workspaces/[id]/skills/[skillId]   — skill detail
 *     PATCH /api/workspaces/[id]/skills/[skillId]  — update skill
 *     DELETE /api/workspaces/[id]/skills/[skillId] — delete skill
 *     GET  /api/admin/stats/tokens    — fleet-wide token stats from DB
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must come before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  forbidden: () => ({
    _status: 403,
    async json() {
      return { error: "Forbidden" };
    },
  }),
  unauthorized: () => ({
    _status: 401,
    async json() {
      return { error: "Not authenticated" };
    },
  }),
}));

vi.mock("@/lib/ws-server", () => ({
  broadcastSkillsConfig: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { WorkspaceSkillDAO, SkillOverrideDAO } from "../packages/control-plane/db";
import { prisma } from "../packages/control-plane/db/client";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { broadcastSkillsConfig } from "../packages/control-plane/lib/ws-server";
import { NextRequest } from "next/server";

import {
  GET as skillsGET,
  POST as skillsPOST,
} from "../packages/control-plane/app/api/admin/skills/route";
import {
  GET as skillDetailGET,
  PATCH as skillDetailPATCH,
  DELETE as skillDetailDELETE,
} from "../packages/control-plane/app/api/(user)/workspaces/[id]/skills/[skillId]/route";
import { GET as statsTokensGET } from "../packages/control-plane/app/api/admin/stats/tokens/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;
const mockBroadcastSkillsConfig = broadcastSkillsConfig as ReturnType<
  typeof vi.fn
>;

/** Test row prefix — used to clean up after all tests */
const T = "test:skills-routes:";

function makeAdminContext(workspaceId?: string) {
  return {
    did: "did:test:admin",
    isGlobalAdmin: true,
    isOwner: true,
    canAccessWorkspace: (_id: string) => true,
    canAdminWorkspace: (_id: string) => true,
  };
}

function makeWorkspaceMemberContext(workspaceId: string) {
  return {
    did: "did:test:member",
    isGlobalAdmin: false,
    isOwner: false,
    canAccessWorkspace: (id: string) => id === workspaceId,
    canAdminWorkspace: (_id: string) => false,
  };
}

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    url,
    body !== undefined ? { body } : undefined
  ) as unknown as NextRequest;
}

function skillParams(id: string, skillId: string) {
  return { params: Promise.resolve({ id, skillId }) };
}

// ---------------------------------------------------------------------------
// Test workspace + agent setup
// ---------------------------------------------------------------------------

let testWorkspaceId: string;
let testWorkspaceId2: string;
let testAgentDid: string;

beforeAll(async () => {
  testWorkspaceId = `${T}workspace-1`;
  testWorkspaceId2 = `${T}workspace-2`;
  testAgentDid = `${T}agent-did-1`;

  // ── Prisma setup ────────────────────────────────────────────────────────
  await prisma.workspace.upsert({
    where: { id: testWorkspaceId },
    create: {
      id: testWorkspaceId,
      name: "Skills Test Workspace",
      slug: "skills-test-workspace",
      color: "#6366f1",
    },
    update: {},
  });
  await prisma.workspace.upsert({
    where: { id: testWorkspaceId2 },
    create: {
      id: testWorkspaceId2,
      name: "Skills Test Workspace 2",
      slug: "skills-test-workspace-2",
      color: "#22c55e",
    },
    update: {},
  });
  await prisma.agent.upsert({
    where: { did: testAgentDid },
    create: { did: testAgentDid, name: "test-agent", capabilities: [] },
    update: {},
  });
  await prisma.agentWorkspace.upsert({
    where: {
      agentDid_workspaceId: { agentDid: testAgentDid, workspaceId: testWorkspaceId },
    },
    create: { agentDid: testAgentDid, workspaceId: testWorkspaceId },
    update: {},
  });
});

afterAll(async () => {
  // Prisma cleanup
  await prisma.agentSkillOverride.deleteMany({
    where: { workspaceSkill: { workspaceId: { in: [testWorkspaceId, testWorkspaceId2] } } },
  });
  await prisma.workspaceSkill.deleteMany({
    where: { workspaceId: { in: [testWorkspaceId, testWorkspaceId2] } },
  });
  await prisma.agentWorkspace.deleteMany({ where: { agentDid: testAgentDid } });
  await prisma.agent.deleteMany({ where: { did: testAgentDid } });
  await prisma.workspace.deleteMany({
    where: { id: { in: [testWorkspaceId, testWorkspaceId2] } },
  });
});

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue(makeAdminContext());
  mockBroadcastSkillsConfig.mockReset();
});

// ===========================================================================
// DB LAYER
// ===========================================================================

describe("DB: createWorkspaceSkill", () => {
  it("inserts a skill and returns a row with correct fields", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}create-basic`,
      description: "A basic test skill",
      version: "1.0.0",
      isRequired: false,
      config: { key: "value" },
    });

    expect(skill.id).toBeTruthy();
    expect(skill.workspaceId).toBe(testWorkspaceId);
    expect(skill.name).toBe(`${T}create-basic`);
    expect(skill.description).toBe("A basic test skill");
    expect(skill.version).toBe("1.0.0");
    expect(skill.isRequired).toBe(false);
    expect(skill.config).toEqual({ key: "value" });
    expect(skill.content).toBeNull();

    await WorkspaceSkillDAO.delete(skill.id);
  });

  it("stores Markdown content when provided", async () => {
    const md = "# My Skill\nDo something useful.";
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}create-with-content`,
      isRequired: true,
      content: md,
    });

    expect(skill.isRequired).toBe(true);
    expect(skill.content).toBe(md);

    await WorkspaceSkillDAO.delete(skill.id);
  });

  it("throws on duplicate name in same workspace", async () => {
    const name = `${T}unique-test`;
    const skill = await WorkspaceSkillDAO.create({ workspaceId: testWorkspaceId, name });

    try {
      await expect(
        WorkspaceSkillDAO.create({ workspaceId: testWorkspaceId, name })
      ).rejects.toThrow();
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("allows same name in different workspaces", async () => {
    const name = `${T}cross-workspace-name`;
    const s1 = await WorkspaceSkillDAO.create({ workspaceId: testWorkspaceId, name });
    const s2 = await WorkspaceSkillDAO.create({ workspaceId: testWorkspaceId2, name });

    expect(s1.id).not.toBe(s2.id);

    await WorkspaceSkillDAO.delete(s1.id);
    await WorkspaceSkillDAO.delete(s2.id);
  });
});

describe("DB: getWorkspaceSkillById", () => {
  it("returns null for unknown id", async () => {
    expect(await WorkspaceSkillDAO.findById("does-not-exist")).toBeNull();
  });

  it("returns the skill row for a known id", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}get-by-id`,
    });

    const found = await WorkspaceSkillDAO.findById(skill.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(skill.id);
    expect(found!.name).toBe(`${T}get-by-id`);

    await WorkspaceSkillDAO.delete(skill.id);
  });
});

describe("DB: updateWorkspaceSkill", () => {
  it("updates description and version", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}update-fields`,
      description: "old desc",
      version: "1.0.0",
    });

    await WorkspaceSkillDAO.update(skill.id, {
      description: "new desc",
      version: "2.0.0",
    });

    const updated = (await WorkspaceSkillDAO.findById(skill.id))!;
    expect(updated.description).toBe("new desc");
    expect(updated.version).toBe("2.0.0");

    await WorkspaceSkillDAO.delete(skill.id);
  });

  it("updates isRequired flag", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}update-required`,
      isRequired: false,
    });

    await WorkspaceSkillDAO.update(skill.id, { isRequired: true });
    expect((await WorkspaceSkillDAO.findById(skill.id))!.isRequired).toBe(true);

    await WorkspaceSkillDAO.update(skill.id, { isRequired: false });
    expect((await WorkspaceSkillDAO.findById(skill.id))!.isRequired).toBe(false);

    await WorkspaceSkillDAO.delete(skill.id);
  });

  it("updates config JSON", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}update-config`,
      config: { original: true },
    });

    await WorkspaceSkillDAO.update(skill.id, {
      config: { updated: true, count: 42 },
    });

    const updated = (await WorkspaceSkillDAO.findById(skill.id))!;
    expect(updated.config).toEqual({ updated: true, count: 42 });

    await WorkspaceSkillDAO.delete(skill.id);
  });

  it("updates content Markdown", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}update-content`,
    });

    const md = "# Updated\nNew instructions.";
    await WorkspaceSkillDAO.update(skill.id, { content: md });

    expect((await WorkspaceSkillDAO.findById(skill.id))!.content).toBe(md);

    await WorkspaceSkillDAO.update(skill.id, { content: null });
    expect((await WorkspaceSkillDAO.findById(skill.id))!.content).toBeNull();

    await WorkspaceSkillDAO.delete(skill.id);
  });

  it("does not touch fields that are not in updates object", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}update-partial`,
      description: "keep me",
      version: "3.0.0",
    });

    await WorkspaceSkillDAO.update(skill.id, { isRequired: true }); // only update isRequired

    const updated = (await WorkspaceSkillDAO.findById(skill.id))!;
    expect(updated.description).toBe("keep me");
    expect(updated.version).toBe("3.0.0");

    await WorkspaceSkillDAO.delete(skill.id);
  });
});

describe("DB: deleteWorkspaceSkill", () => {
  it("removes the skill so findById returns null", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}delete-me`,
    });
    await WorkspaceSkillDAO.delete(skill.id);
    expect(await WorkspaceSkillDAO.findById(skill.id)).toBeNull();
  });
});

describe("DB: getAllSkillsWithWorkspaces", () => {
  it("includes skills from multiple workspaces with workspace names", async () => {
    const s1 = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}all-r1`,
    });
    const s2 = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId2,
      name: `${T}all-r2`,
    });

    try {
      const rows = await WorkspaceSkillDAO.findAllWithWorkspaces();
      const r1 = rows.find((r) => r.id === s1.id);
      const r2 = rows.find((r) => r.id === s2.id);

      expect(r1).toBeDefined();
      expect(r1!.workspaceName).toBe("Skills Test Workspace");
      expect(r1!.workspaceId).toBe(testWorkspaceId);

      expect(r2).toBeDefined();
      expect(r2!.workspaceName).toBe("Skills Test Workspace 2");
    } finally {
      await WorkspaceSkillDAO.delete(s1.id);
      await WorkspaceSkillDAO.delete(s2.id);
    }
  });

  it("returns agentCount and overrideCount columns", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}all-counts`,
    });

    try {
      const rows = await WorkspaceSkillDAO.findAllWithWorkspaces();
      const row = rows.find((r) => r.id === skill.id)!;
      expect(typeof row.agentCount).toBe("number");
      expect(typeof row.overrideCount).toBe("number");
      // testAgentDid is enrolled in testWorkspaceId, so agentCount >= 1
      expect(row.agentCount).toBeGreaterThanOrEqual(1);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });
});

describe("DB: getAgentEffectiveSkills", () => {
  it("returns skills for the agent's workspace with content", async () => {
    const md = "# Effective Skill\nDo things.";
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}effective-with-content`,
      isRequired: true,
      config: { enabled: true },
      content: md,
    });

    try {
      const skills = await SkillOverrideDAO.getEffectiveSkills(testAgentDid);
      const found = skills.find((s) => s.name === `${T}effective-with-content`);
      expect(found).toBeDefined();
      expect(found!.content).toBe(md);
      expect(found!.isRequired).toBe(true);
      expect(found!.enabled).toBe(true);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("returns empty array for an agent not enrolled in any workspace", async () => {
    const skills = await SkillOverrideDAO.getEffectiveSkills(
      "did:test:unknown-agent"
    );
    expect(Array.isArray(skills)).toBe(true);
    expect(skills).toHaveLength(0);
  });
});

// ===========================================================================
// API: GET /api/admin/skills
// ===========================================================================

describe("GET /api/admin/skills", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await skillsGET(
      req("GET", "http://localhost/api/admin/skills") as any
    );
    expect(res._status).toBe(401);
  });

  it("returns 403 for non-global-admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      isGlobalAdmin: false,
    });
    const res = await skillsGET(
      req("GET", "http://localhost/api/admin/skills") as any
    );
    expect(res._status).toBe(403);
  });

  it("returns skill rows for global admin", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}api-list`,
    });
    try {
      const res = await skillsGET(
        req("GET", "http://localhost/api/admin/skills") as any
      );
      expect(res._status).toBe(200);
      const body = (await res.json()) as { id: string }[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((r) => r.id === skill.id)).toBe(true);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });
});

// ===========================================================================
// API: POST /api/admin/skills
// ===========================================================================

describe("POST /api/admin/skills", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const r = req("POST", "http://localhost/api/admin/skills", {
      workspaceId: testWorkspaceId,
      name: "x",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(401);
  });

  it("returns 403 for non-global-admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      isGlobalAdmin: false,
    });
    const r = req("POST", "http://localhost/api/admin/skills", {
      workspaceId: testWorkspaceId,
      name: "x",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(403);
  });

  it("returns 400 when workspaceId is missing", async () => {
    const r = req("POST", "http://localhost/api/admin/skills", { name: "no-workspace" });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const r = req("POST", "http://localhost/api/admin/skills", {
      workspaceId: testWorkspaceId,
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 400 when name is blank", async () => {
    const r = req("POST", "http://localhost/api/admin/skills", {
      workspaceId: testWorkspaceId,
      name: "   ",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 404 when workspace does not exist", async () => {
    const r = req("POST", "http://localhost/api/admin/skills", {
      workspaceId: "nonexistent-workspace",
      name: "x",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(404);
  });

  it("creates a skill and broadcasts config", async () => {
    const r = req("POST", "http://localhost/api/admin/skills", {
      workspaceId: testWorkspaceId,
      name: `${T}api-create`,
      description: "Created via API",
      version: "1.2.3",
      isRequired: true,
      config: { tone: "formal" },
      content: "# API Created Skill\nInstructions here.",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(201);

    const body = (await res.json()) as {
      id: string;
      workspaceId: string;
      name: string;
      content: string | null;
    };
    expect(body.id).toBeTruthy();
    expect(body.workspaceId).toBe(testWorkspaceId);
    expect(body.name).toBe(`${T}api-create`);
    expect(body.content).toBe("# API Created Skill\nInstructions here.");

    expect(mockBroadcastSkillsConfig).toHaveBeenCalledWith(testWorkspaceId);

    // Verify it's in the DB (Prisma)
    const row = await WorkspaceSkillDAO.findById(body.id);
    expect(row).toBeDefined();

    await WorkspaceSkillDAO.delete(body.id);
  });

  it("returns 409 when skill name already exists in that workspace", async () => {
    const name = `${T}api-duplicate`;
    const existing = await WorkspaceSkillDAO.create({ workspaceId: testWorkspaceId, name });

    try {
      const r = req("POST", "http://localhost/api/admin/skills", {
        workspaceId: testWorkspaceId,
        name,
      });
      const res = await skillsPOST(r as any);
      expect(res._status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain(name);
    } finally {
      await WorkspaceSkillDAO.delete(existing.id);
    }
  });
});

// ===========================================================================
// API: GET /api/workspaces/[id]/skills/[skillId]
// ===========================================================================

describe("GET /api/workspaces/[id]/skills/[skillId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await skillDetailGET(
      req("GET", "http://localhost/api/workspaces/r/skills/s") as any,
      skillParams("r", "s")
    );
    expect(res._status).toBe(401);
  });

  it("returns 403 when user cannot access the workspace", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      canAccessWorkspace: () => false,
    });
    const res = await skillDetailGET(
      req("GET", "http://localhost/") as any,
      skillParams(testWorkspaceId, "any")
    );
    expect(res._status).toBe(403);
  });

  it("returns 404 for unknown skill id", async () => {
    const res = await skillDetailGET(
      req("GET", "http://localhost/") as any,
      skillParams(testWorkspaceId, "does-not-exist")
    );
    expect(res._status).toBe(404);
  });

  it("returns 404 when skill belongs to a different workspace", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId2,
      name: `${T}wrong-workspace-get`,
    });
    try {
      const res = await skillDetailGET(
        req("GET", "http://localhost/") as any,
        skillParams(testWorkspaceId, skill.id) // wrong workspace
      );
      expect(res._status).toBe(404);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("returns skill detail with camelCase fields", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}get-detail`,
      description: "detail desc",
      version: "4.0.0",
      isRequired: true,
      config: { x: 1 },
      content: "# Detail\nContent.",
    });

    try {
      const res = await skillDetailGET(
        req("GET", "http://localhost/") as any,
        skillParams(testWorkspaceId, skill.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as {
        skill: {
          id: string;
          workspaceId: string;
          name: string;
          description: string;
          version: string;
          isRequired: boolean;
          config: Record<string, unknown>;
          createdAt: string;
        };
      };
      expect(body.skill.id).toBe(skill.id);
      expect(body.skill.workspaceId).toBe(testWorkspaceId);
      expect(body.skill.name).toBe(`${T}get-detail`);
      expect(body.skill.description).toBe("detail desc");
      expect(body.skill.version).toBe("4.0.0");
      expect(body.skill.isRequired).toBe(true);
      expect(body.skill.config).toEqual({ x: 1 });
      expect(body.skill.createdAt).toBeTruthy();
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });
});

// ===========================================================================
// API: PATCH /api/workspaces/[id]/skills/[skillId]
// ===========================================================================

describe("PATCH /api/workspaces/[id]/skills/[skillId]", () => {
  it("returns 403 when user is not workspace admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce(
      makeWorkspaceMemberContext(testWorkspaceId)
    );
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}patch-no-admin`,
    });
    try {
      const r = req("PATCH", "http://localhost/", { description: "x" });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testWorkspaceId, skill.id)
      );
      expect(res._status).toBe(403);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("updates description and returns updated skill", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}patch-desc`,
      description: "old",
    });
    try {
      const r = req("PATCH", "http://localhost/", { description: "new desc" });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testWorkspaceId, skill.id)
      );
      expect(res._status).toBe(200);
      const body = (await res.json()) as { skill: { description: string } };
      expect(body.skill.description).toBe("new desc");
      expect((await WorkspaceSkillDAO.findById(skill.id))!.description).toBe(
        "new desc"
      );
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("updates content markdown", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}patch-content`,
    });
    try {
      const md = "# Patched\nNew instructions.";
      const r = req("PATCH", "http://localhost/", { content: md });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testWorkspaceId, skill.id)
      );
      expect(res._status).toBe(200);
      expect((await WorkspaceSkillDAO.findById(skill.id))!.content).toBe(md);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("sets content to null when explicitly passed null", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}patch-null-content`,
      content: "some content",
    });
    try {
      const r = req("PATCH", "http://localhost/", { content: null });
      await skillDetailPATCH(r as any, skillParams(testWorkspaceId, skill.id));
      expect((await WorkspaceSkillDAO.findById(skill.id))!.content).toBeNull();
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("broadcasts skills config after update", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}patch-broadcast`,
    });
    try {
      const r = req("PATCH", "http://localhost/", { version: "9.0.0" });
      await skillDetailPATCH(r as any, skillParams(testWorkspaceId, skill.id));
      expect(mockBroadcastSkillsConfig).toHaveBeenCalledWith(testWorkspaceId);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("returns 404 when skill belongs to a different workspace", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId2,
      name: `${T}patch-wrong-workspace`,
    });
    try {
      const r = req("PATCH", "http://localhost/", { description: "x" });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testWorkspaceId, skill.id)
      );
      expect(res._status).toBe(404);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });
});

// ===========================================================================
// API: DELETE /api/workspaces/[id]/skills/[skillId]
// ===========================================================================

describe("DELETE /api/workspaces/[id]/skills/[skillId]", () => {
  it("returns 403 when user is not workspace admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce(
      makeWorkspaceMemberContext(testWorkspaceId)
    );
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}delete-no-admin`,
    });
    try {
      const res = await skillDetailDELETE(
        req("DELETE", "http://localhost/") as any,
        skillParams(testWorkspaceId, skill.id)
      );
      expect(res._status).toBe(403);
    } finally {
      await WorkspaceSkillDAO.delete(skill.id);
    }
  });

  it("removes the skill and broadcasts config", async () => {
    const skill = await WorkspaceSkillDAO.create({
      workspaceId: testWorkspaceId,
      name: `${T}delete-ok`,
    });

    const res = await skillDetailDELETE(
      req("DELETE", "http://localhost/") as any,
      skillParams(testWorkspaceId, skill.id)
    );
    expect(res._status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(await WorkspaceSkillDAO.findById(skill.id)).toBeNull();
    expect(mockBroadcastSkillsConfig).toHaveBeenCalledWith(testWorkspaceId);
  });

  it("returns 404 for unknown skill", async () => {
    const res = await skillDetailDELETE(
      req("DELETE", "http://localhost/") as any,
      skillParams(testWorkspaceId, "nonexistent-id")
    );
    expect(res._status).toBe(404);
  });
});

// ===========================================================================
// API: GET /api/admin/stats/tokens
// ===========================================================================

describe("GET /api/admin/stats/tokens", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await statsTokensGET(
      req("GET", "http://localhost/api/admin/stats/tokens") as any
    );
    expect(res._status).toBe(401);
  });

  it("returns 403 for non-global-admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      isGlobalAdmin: false,
    });
    const res = await statsTokensGET(
      req("GET", "http://localhost/api/admin/stats/tokens") as any
    );
    expect(res._status).toBe(403);
  });

  it("returns allTime / daily / monthly structure with numeric values", async () => {
    const res = await statsTokensGET(
      req("GET", "http://localhost/api/admin/stats/tokens") as any
    );
    expect(res._status).toBe(200);

    const body = (await res.json()) as {
      allTime: { promptTokens: number; completionTokens: number };
      daily: { promptTokens: number; completionTokens: number };
      monthly: { promptTokens: number; completionTokens: number };
    };

    expect(typeof body.allTime.promptTokens).toBe("number");
    expect(typeof body.allTime.completionTokens).toBe("number");
    expect(typeof body.daily.promptTokens).toBe("number");
    expect(typeof body.daily.completionTokens).toBe("number");
    expect(typeof body.monthly.promptTokens).toBe("number");
    expect(typeof body.monthly.completionTokens).toBe("number");
  });

  it("reflects cumulative token data written via upsertTokenUsage", async () => {
    const testDid = `${T}token-agent`;

    // Prisma (AgentDAO.getTotalFleetTokenUsage uses Prisma)
    await prisma.agent.upsert({
      where: { did: testDid },
      create: { did: testDid, name: "token-test-agent", capabilities: [] },
      update: {},
    });
    await prisma.agentTokenUsage.upsert({
      where: { agentDid: testDid },
      create: { agentDid: testDid, promptTokens: 1000, completionTokens: 500 },
      update: { promptTokens: 1000, completionTokens: 500 },
    });

    try {
      const res = await statsTokensGET(
        req("GET", "http://localhost/api/admin/stats/tokens") as any
      );
      const body = (await res.json()) as {
        allTime: { promptTokens: number; completionTokens: number };
      };
      expect(body.allTime.promptTokens).toBeGreaterThanOrEqual(1000);
      expect(body.allTime.completionTokens).toBeGreaterThanOrEqual(500);
    } finally {
      await prisma.agentTokenUsage.deleteMany({ where: { agentDid: testDid } });
      await prisma.agent.deleteMany({ where: { did: testDid } });
    }
  });

  it("reflects daily/monthly history buckets", async () => {
    const testDid = `${T}token-history-agent`;
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    // Prisma (for route handler)
    await prisma.agent.upsert({
      where: { did: testDid },
      create: { did: testDid, name: "history-test-agent", capabilities: [] },
      update: {},
    });
    await prisma.agentTokenUsageHistory.upsert({
      where: {
        agentDid_bucket_granularity: {
          agentDid: testDid,
          bucket: today,
          granularity: "day",
        },
      },
      create: {
        agentDid: testDid,
        bucket: today,
        granularity: "day",
        promptTokens: 200,
        completionTokens: 100,
      },
      update: { promptTokens: 200, completionTokens: 100 },
    });
    await prisma.agentTokenUsageHistory.upsert({
      where: {
        agentDid_bucket_granularity: {
          agentDid: testDid,
          bucket: thisMonth,
          granularity: "month",
        },
      },
      create: {
        agentDid: testDid,
        bucket: thisMonth,
        granularity: "month",
        promptTokens: 800,
        completionTokens: 400,
      },
      update: { promptTokens: 800, completionTokens: 400 },
    });

    try {
      const res = await statsTokensGET(
        req("GET", "http://localhost/api/admin/stats/tokens") as any
      );
      const body = (await res.json()) as {
        daily: { promptTokens: number; completionTokens: number };
        monthly: { promptTokens: number; completionTokens: number };
      };
      expect(body.daily.promptTokens).toBeGreaterThanOrEqual(200);
      expect(body.daily.completionTokens).toBeGreaterThanOrEqual(100);
      expect(body.monthly.promptTokens).toBeGreaterThanOrEqual(800);
      expect(body.monthly.completionTokens).toBeGreaterThanOrEqual(400);
    } finally {
      await prisma.agentTokenUsageHistory.deleteMany({
        where: { agentDid: testDid },
      });
      await prisma.agent.deleteMany({ where: { did: testDid } });
    }
  });
});
