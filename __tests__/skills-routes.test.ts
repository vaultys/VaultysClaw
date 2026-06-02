/**
 * Tests for the skills API layer:
 *   DB helpers: createRealmSkill, updateRealmSkill, deleteRealmSkill,
 *               getRealmSkillById, getAllSkillsWithRealms, getAgentEffectiveSkills
 *   API routes:
 *     GET  /api/skills          — list all skills with realm info (admin only)
 *     POST /api/skills          — create a skill for a realm (admin only)
 *     GET  /api/realms/[id]/skills/[skillId]   — skill detail
 *     PATCH /api/realms/[id]/skills/[skillId]  — update skill
 *     DELETE /api/realms/[id]/skills/[skillId] — delete skill
 *     GET  /api/stats/tokens    — fleet-wide token stats from DB
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

import { getDb } from "../packages/control-plane/lib/db";
import {
  createRealmSkill,
  updateRealmSkill,
  deleteRealmSkill,
  getRealmSkillById,
  getAllSkillsWithRealms,
  getAgentEffectiveSkills,
} from "../packages/control-plane/lib/db";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { broadcastSkillsConfig } from "../packages/control-plane/lib/ws-server";
import { NextRequest } from "next/server";

import {
  GET as skillsGET,
  POST as skillsPOST,
} from "../packages/control-plane/app/api/skills/route";
import {
  GET as skillDetailGET,
  PATCH as skillDetailPATCH,
  DELETE as skillDetailDELETE,
} from "../packages/control-plane/app/api/realms/[id]/skills/[skillId]/route";
import { GET as statsTokensGET } from "../packages/control-plane/app/api/stats/tokens/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;
const mockBroadcastSkillsConfig = broadcastSkillsConfig as ReturnType<
  typeof vi.fn
>;

/** Test row prefix — used to clean up after all tests */
const T = "test:skills-routes:";

function makeAdminContext(realmId?: string) {
  return {
    did: "did:test:admin",
    isGlobalAdmin: true,
    isOwner: true,
    canAccessRealm: (_id: string) => true,
    canAdminRealm: (_id: string) => true,
  };
}

function makeRealmMemberContext(realmId: string) {
  return {
    did: "did:test:member",
    isGlobalAdmin: false,
    isOwner: false,
    canAccessRealm: (id: string) => id === realmId,
    canAdminRealm: (_id: string) => false,
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
// Test realm + agent setup
// ---------------------------------------------------------------------------

let testRealmId: string;
let testRealmId2: string;
let testAgentDid: string;

beforeAll(() => {
  const db = getDb();
  testRealmId = `${T}realm-1`;
  testRealmId2 = `${T}realm-2`;
  testAgentDid = `${T}agent-did-1`;

  db.prepare(
    `
    INSERT OR IGNORE INTO realms (id, name, slug, color, is_default)
    VALUES (?, 'Skills Test Realm', 'skills-test-realm', '#6366f1', 0)
  `
  ).run(testRealmId);

  db.prepare(
    `
    INSERT OR IGNORE INTO realms (id, name, slug, color, is_default)
    VALUES (?, 'Skills Test Realm 2', 'skills-test-realm-2', '#22c55e', 0)
  `
  ).run(testRealmId2);

  // Insert a test agent
  db.prepare(
    `
    INSERT OR IGNORE INTO agents (did, name, capabilities, registered_at)
    VALUES (?, 'test-agent', '[]', datetime('now'))
  `
  ).run(testAgentDid);

  // Enroll the agent in realm 1
  db.prepare(
    `
    INSERT OR IGNORE INTO agent_realms (agent_did, realm_id, is_primary)
    VALUES (?, ?, 0)
  `
  ).run(testAgentDid, testRealmId);
});

afterAll(() => {
  const db = getDb();
  db.prepare(
    "DELETE FROM agent_skill_overrides WHERE realm_skill_id IN (SELECT id FROM realm_skills WHERE realm_id LIKE ?)"
  ).run(`${T}%`);
  db.prepare("DELETE FROM realm_skills WHERE realm_id LIKE ?").run(`${T}%`);
  db.prepare("DELETE FROM realm_skills WHERE name LIKE ?").run(`${T}%`);
  db.prepare("DELETE FROM agent_realms WHERE agent_did = ?").run(testAgentDid);
  db.prepare("DELETE FROM agents WHERE did = ?").run(testAgentDid);
  db.prepare("DELETE FROM realms WHERE id LIKE ?").run(`${T}%`);
});

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue(makeAdminContext());
  mockBroadcastSkillsConfig.mockReset();
});

// ===========================================================================
// DB LAYER
// ===========================================================================

describe("DB: createRealmSkill", () => {
  it("inserts a skill and returns a row with correct fields", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}create-basic`,
      description: "A basic test skill",
      version: "1.0.0",
      isRequired: false,
      config: { key: "value" },
    });

    expect(skill.id).toBeTruthy();
    expect(skill.realm_id).toBe(testRealmId);
    expect(skill.name).toBe(`${T}create-basic`);
    expect(skill.description).toBe("A basic test skill");
    expect(skill.version).toBe("1.0.0");
    expect(skill.is_required).toBe(0);
    expect(JSON.parse(skill.config ?? "{}")).toEqual({ key: "value" });
    expect(skill.content).toBeNull();

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });

  it("stores Markdown content when provided", () => {
    const md = "# My Skill\nDo something useful.";
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}create-with-content`,
      isRequired: true,
      content: md,
    });

    expect(skill.is_required).toBe(1);
    expect(skill.content).toBe(md);

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });

  it("throws UNIQUE error when same name added twice to same realm", () => {
    const name = `${T}unique-test`;
    const skill = createRealmSkill({ realmId: testRealmId, name });

    try {
      expect(() => createRealmSkill({ realmId: testRealmId, name })).toThrow(
        /UNIQUE/
      );
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("allows same name in different realms", () => {
    const name = `${T}cross-realm-name`;
    const s1 = createRealmSkill({ realmId: testRealmId, name });
    const s2 = createRealmSkill({ realmId: testRealmId2, name });

    expect(s1.id).not.toBe(s2.id);

    getDb()
      .prepare("DELETE FROM realm_skills WHERE id IN (?, ?)")
      .run(s1.id, s2.id);
  });
});

describe("DB: getRealmSkillById", () => {
  it("returns undefined for unknown id", () => {
    expect(getRealmSkillById("does-not-exist")).toBeUndefined();
  });

  it("returns the skill row for a known id", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}get-by-id`,
    });

    const found = getRealmSkillById(skill.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(skill.id);
    expect(found!.name).toBe(`${T}get-by-id`);

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });
});

describe("DB: updateRealmSkill", () => {
  it("updates description and version", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}update-fields`,
      description: "old desc",
      version: "1.0.0",
    });

    updateRealmSkill(skill.id, { description: "new desc", version: "2.0.0" });

    const updated = getRealmSkillById(skill.id)!;
    expect(updated.description).toBe("new desc");
    expect(updated.version).toBe("2.0.0");

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });

  it("updates isRequired flag", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}update-required`,
      isRequired: false,
    });

    updateRealmSkill(skill.id, { isRequired: true });
    expect(getRealmSkillById(skill.id)!.is_required).toBe(1);

    updateRealmSkill(skill.id, { isRequired: false });
    expect(getRealmSkillById(skill.id)!.is_required).toBe(0);

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });

  it("updates config JSON", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}update-config`,
      config: { original: true },
    });

    updateRealmSkill(skill.id, { config: { updated: true, count: 42 } });

    const updated = getRealmSkillById(skill.id)!;
    expect(JSON.parse(updated.config ?? "{}")).toEqual({
      updated: true,
      count: 42,
    });

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });

  it("updates content Markdown", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}update-content`,
    });

    const md = "# Updated\nNew instructions.";
    updateRealmSkill(skill.id, { content: md });

    expect(getRealmSkillById(skill.id)!.content).toBe(md);

    updateRealmSkill(skill.id, { content: null });
    expect(getRealmSkillById(skill.id)!.content).toBeNull();

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });

  it("does not touch fields that are not in updates object", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}update-partial`,
      description: "keep me",
      version: "3.0.0",
    });

    updateRealmSkill(skill.id, { isRequired: true }); // only update isRequired

    const updated = getRealmSkillById(skill.id)!;
    expect(updated.description).toBe("keep me");
    expect(updated.version).toBe("3.0.0");

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
  });
});

describe("DB: deleteRealmSkill", () => {
  it("removes the skill so getRealmSkillById returns undefined", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}delete-me`,
    });
    deleteRealmSkill(skill.id);
    expect(getRealmSkillById(skill.id)).toBeUndefined();
  });
});

describe("DB: getAllSkillsWithRealms", () => {
  it("includes skills from multiple realms with realm names", () => {
    const s1 = createRealmSkill({ realmId: testRealmId, name: `${T}all-r1` });
    const s2 = createRealmSkill({ realmId: testRealmId2, name: `${T}all-r2` });

    try {
      const rows = getAllSkillsWithRealms();
      const r1 = rows.find((r) => r.id === s1.id);
      const r2 = rows.find((r) => r.id === s2.id);

      expect(r1).toBeDefined();
      expect(r1!.realm_name).toBe("Skills Test Realm");
      expect(r1!.realm_id).toBe(testRealmId);

      expect(r2).toBeDefined();
      expect(r2!.realm_name).toBe("Skills Test Realm 2");
    } finally {
      getDb()
        .prepare("DELETE FROM realm_skills WHERE id IN (?, ?)")
        .run(s1.id, s2.id);
    }
  });

  it("returns agent_count and override_count columns", () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}all-counts`,
    });

    try {
      const rows = getAllSkillsWithRealms();
      const row = rows.find((r) => r.id === skill.id)!;
      expect(typeof row.agent_count).toBe("number");
      expect(typeof row.override_count).toBe("number");
      // testAgentDid is enrolled in testRealmId, so agent_count >= 1
      expect(row.agent_count).toBeGreaterThanOrEqual(1);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });
});

describe("DB: getAgentEffectiveSkills", () => {
  it("returns skills for the agent's realm with content", () => {
    const md = "# Effective Skill\nDo things.";
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}effective-with-content`,
      isRequired: true,
      config: { enabled: true },
      content: md,
    });

    try {
      const skills = getAgentEffectiveSkills(testAgentDid);
      const found = skills.find((s) => s.name === `${T}effective-with-content`);
      expect(found).toBeDefined();
      expect(found!.content).toBe(md);
      expect(found!.isRequired).toBe(true);
      expect(found!.enabled).toBe(true);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("returns empty array for an agent not enrolled in any realm", () => {
    const skills = getAgentEffectiveSkills("did:test:unknown-agent");
    expect(Array.isArray(skills)).toBe(true);
    expect(skills).toHaveLength(0);
  });
});

// ===========================================================================
// API: GET /api/skills
// ===========================================================================

describe("GET /api/skills", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValueOnce(null);
    const res = await skillsGET();
    expect(res._status).toBe(401);
  });

  it("returns 403 for non-global-admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      isGlobalAdmin: false,
    });
    const res = await skillsGET();
    expect(res._status).toBe(403);
  });

  it("returns skill rows for global admin", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}api-list`,
    });
    try {
      const res = await skillsGET();
      expect(res._status).toBe(200);
      const body = (await res.json()) as { id: string }[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((r) => r.id === skill.id)).toBe(true);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });
});

// ===========================================================================
// API: POST /api/skills
// ===========================================================================

describe("POST /api/skills", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValueOnce(null);
    const r = req("POST", "http://localhost/api/skills", {
      realmId: testRealmId,
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
    const r = req("POST", "http://localhost/api/skills", {
      realmId: testRealmId,
      name: "x",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(403);
  });

  it("returns 400 when realmId is missing", async () => {
    const r = req("POST", "http://localhost/api/skills", { name: "no-realm" });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const r = req("POST", "http://localhost/api/skills", {
      realmId: testRealmId,
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 400 when name is blank", async () => {
    const r = req("POST", "http://localhost/api/skills", {
      realmId: testRealmId,
      name: "   ",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(400);
  });

  it("returns 404 when realm does not exist", async () => {
    const r = req("POST", "http://localhost/api/skills", {
      realmId: "nonexistent-realm",
      name: "x",
    });
    const res = await skillsPOST(r as any);
    expect(res._status).toBe(404);
  });

  it("creates a skill and broadcasts config", async () => {
    const r = req("POST", "http://localhost/api/skills", {
      realmId: testRealmId,
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
      realm_id: string;
      name: string;
      content: string | null;
    };
    expect(body.id).toBeTruthy();
    expect(body.realm_id).toBe(testRealmId);
    expect(body.name).toBe(`${T}api-create`);
    expect(body.content).toBe("# API Created Skill\nInstructions here.");

    expect(mockBroadcastSkillsConfig).toHaveBeenCalledWith(testRealmId);

    // Verify it's in the DB
    const row = getRealmSkillById(body.id);
    expect(row).toBeDefined();

    getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(body.id);
  });

  it("returns 409 when skill name already exists in that realm", async () => {
    const name = `${T}api-duplicate`;
    const existing = createRealmSkill({ realmId: testRealmId, name });

    try {
      const r = req("POST", "http://localhost/api/skills", {
        realmId: testRealmId,
        name,
      });
      const res = await skillsPOST(r as any);
      expect(res._status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain(name);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(existing.id);
    }
  });
});

// ===========================================================================
// API: GET /api/realms/[id]/skills/[skillId]
// ===========================================================================

describe("GET /api/realms/[id]/skills/[skillId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValueOnce(null);
    const res = await skillDetailGET(
      req("GET", "http://localhost/api/realms/r/skills/s") as any,
      skillParams("r", "s")
    );
    expect(res._status).toBe(401);
  });

  it("returns 403 when user cannot access the realm", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      canAccessRealm: () => false,
    });
    const res = await skillDetailGET(
      req("GET", "http://localhost/") as any,
      skillParams(testRealmId, "any")
    );
    expect(res._status).toBe(403);
  });

  it("returns 404 for unknown skill id", async () => {
    const res = await skillDetailGET(
      req("GET", "http://localhost/") as any,
      skillParams(testRealmId, "does-not-exist")
    );
    expect(res._status).toBe(404);
  });

  it("returns 404 when skill belongs to a different realm", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId2,
      name: `${T}wrong-realm-get`,
    });
    try {
      const res = await skillDetailGET(
        req("GET", "http://localhost/") as any,
        skillParams(testRealmId, skill.id) // wrong realm
      );
      expect(res._status).toBe(404);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("returns skill detail with camelCase fields", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
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
        skillParams(testRealmId, skill.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as {
        skill: {
          id: string;
          realmId: string;
          name: string;
          description: string;
          version: string;
          isRequired: boolean;
          config: Record<string, unknown>;
          createdAt: string;
        };
      };
      expect(body.skill.id).toBe(skill.id);
      expect(body.skill.realmId).toBe(testRealmId);
      expect(body.skill.name).toBe(`${T}get-detail`);
      expect(body.skill.description).toBe("detail desc");
      expect(body.skill.version).toBe("4.0.0");
      expect(body.skill.isRequired).toBe(true);
      expect(body.skill.config).toEqual({ x: 1 });
      expect(body.skill.createdAt).toBeTruthy();
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });
});

// ===========================================================================
// API: PATCH /api/realms/[id]/skills/[skillId]
// ===========================================================================

describe("PATCH /api/realms/[id]/skills/[skillId]", () => {
  it("returns 403 when user is not realm admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce(
      makeRealmMemberContext(testRealmId)
    );
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}patch-no-admin`,
    });
    try {
      const r = req("PATCH", "http://localhost/", { description: "x" });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testRealmId, skill.id)
      );
      expect(res._status).toBe(403);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("updates description and returns updated skill", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}patch-desc`,
      description: "old",
    });

    try {
      const r = req("PATCH", "http://localhost/", { description: "new desc" });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testRealmId, skill.id)
      );
      expect(res._status).toBe(200);

      const body = (await res.json()) as { skill: { description: string } };
      expect(body.skill.description).toBe("new desc");

      // Verify DB was updated
      expect(getRealmSkillById(skill.id)!.description).toBe("new desc");
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("updates content markdown", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}patch-content`,
    });

    try {
      const md = "# Patched\nNew instructions.";
      const r = req("PATCH", "http://localhost/", { content: md });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testRealmId, skill.id)
      );
      expect(res._status).toBe(200);

      expect(getRealmSkillById(skill.id)!.content).toBe(md);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("sets content to null when explicitly passed null", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}patch-null-content`,
      content: "some content",
    });

    try {
      const r = req("PATCH", "http://localhost/", { content: null });
      await skillDetailPATCH(r as any, skillParams(testRealmId, skill.id));
      expect(getRealmSkillById(skill.id)!.content).toBeNull();
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("broadcasts skills config after update", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}patch-broadcast`,
    });

    try {
      const r = req("PATCH", "http://localhost/", { version: "9.0.0" });
      await skillDetailPATCH(r as any, skillParams(testRealmId, skill.id));
      expect(mockBroadcastSkillsConfig).toHaveBeenCalledWith(testRealmId);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("returns 404 when skill belongs to a different realm", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId2,
      name: `${T}patch-wrong-realm`,
    });
    try {
      const r = req("PATCH", "http://localhost/", { description: "x" });
      const res = await skillDetailPATCH(
        r as any,
        skillParams(testRealmId, skill.id)
      );
      expect(res._status).toBe(404);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });
});

// ===========================================================================
// API: DELETE /api/realms/[id]/skills/[skillId]
// ===========================================================================

describe("DELETE /api/realms/[id]/skills/[skillId]", () => {
  it("returns 403 when user is not realm admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce(
      makeRealmMemberContext(testRealmId)
    );
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}delete-no-admin`,
    });
    try {
      const res = await skillDetailDELETE(
        req("DELETE", "http://localhost/") as any,
        skillParams(testRealmId, skill.id)
      );
      expect(res._status).toBe(403);
    } finally {
      getDb().prepare("DELETE FROM realm_skills WHERE id = ?").run(skill.id);
    }
  });

  it("removes the skill and broadcasts config", async () => {
    const skill = createRealmSkill({
      realmId: testRealmId,
      name: `${T}delete-ok`,
    });

    const res = await skillDetailDELETE(
      req("DELETE", "http://localhost/") as any,
      skillParams(testRealmId, skill.id)
    );
    expect(res._status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(getRealmSkillById(skill.id)).toBeUndefined();
    expect(mockBroadcastSkillsConfig).toHaveBeenCalledWith(testRealmId);
  });

  it("returns 404 for unknown skill", async () => {
    const res = await skillDetailDELETE(
      req("DELETE", "http://localhost/") as any,
      skillParams(testRealmId, "nonexistent-id")
    );
    expect(res._status).toBe(404);
  });
});

// ===========================================================================
// API: GET /api/stats/tokens
// ===========================================================================

describe("GET /api/stats/tokens", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValueOnce(null);
    const res = await statsTokensGET();
    expect(res._status).toBe(401);
  });

  it("returns 403 for non-global-admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      isGlobalAdmin: false,
    });
    const res = await statsTokensGET();
    expect(res._status).toBe(403);
  });

  it("returns allTime / daily / monthly structure with numeric values", async () => {
    const res = await statsTokensGET();
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
    const db = getDb();
    const testDid = `${T}token-agent`;

    // Ensure agent exists
    db.prepare(
      `
      INSERT OR IGNORE INTO agents (did, name, capabilities, registered_at)
      VALUES (?, 'token-test-agent', '[]', datetime('now'))
    `
    ).run(testDid);

    // Write known cumulative totals
    db.prepare(
      `
      INSERT INTO agent_token_usage (agent_did, prompt_tokens, completion_tokens, updated_at)
      VALUES (?, 1000, 500, datetime('now'))
      ON CONFLICT(agent_did) DO UPDATE SET
        prompt_tokens = excluded.prompt_tokens,
        completion_tokens = excluded.completion_tokens,
        updated_at = datetime('now')
    `
    ).run(testDid);

    try {
      const res = await statsTokensGET();
      const body = (await res.json()) as {
        allTime: { promptTokens: number; completionTokens: number };
      };
      // The all-time total should include our inserted agent's tokens
      expect(body.allTime.promptTokens).toBeGreaterThanOrEqual(1000);
      expect(body.allTime.completionTokens).toBeGreaterThanOrEqual(500);
    } finally {
      db.prepare("DELETE FROM agent_token_usage WHERE agent_did = ?").run(
        testDid
      );
      db.prepare("DELETE FROM agents WHERE did = ?").run(testDid);
    }
  });

  it("reflects daily/monthly history buckets", async () => {
    const db = getDb();
    const testDid = `${T}token-history-agent`;
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    db.prepare(
      `
      INSERT OR IGNORE INTO agents (did, name, capabilities, registered_at)
      VALUES (?, 'history-test-agent', '[]', datetime('now'))
    `
    ).run(testDid);

    db.prepare(
      `
      INSERT INTO agent_token_usage_history (agent_did, bucket, granularity, prompt_tokens, completion_tokens, updated_at)
      VALUES (?, ?, 'day', 200, 100, datetime('now'))
      ON CONFLICT(agent_did, bucket, granularity) DO UPDATE SET
        prompt_tokens = prompt_tokens + 200, completion_tokens = completion_tokens + 100
    `
    ).run(testDid, today);

    db.prepare(
      `
      INSERT INTO agent_token_usage_history (agent_did, bucket, granularity, prompt_tokens, completion_tokens, updated_at)
      VALUES (?, ?, 'month', 800, 400, datetime('now'))
      ON CONFLICT(agent_did, bucket, granularity) DO UPDATE SET
        prompt_tokens = prompt_tokens + 800, completion_tokens = completion_tokens + 400
    `
    ).run(testDid, thisMonth);

    try {
      const res = await statsTokensGET();
      const body = (await res.json()) as {
        daily: { promptTokens: number; completionTokens: number };
        monthly: { promptTokens: number; completionTokens: number };
      };
      expect(body.daily.promptTokens).toBeGreaterThanOrEqual(200);
      expect(body.daily.completionTokens).toBeGreaterThanOrEqual(100);
      expect(body.monthly.promptTokens).toBeGreaterThanOrEqual(800);
      expect(body.monthly.completionTokens).toBeGreaterThanOrEqual(400);
    } finally {
      db.prepare(
        "DELETE FROM agent_token_usage_history WHERE agent_did = ?"
      ).run(testDid);
      db.prepare("DELETE FROM agents WHERE did = ?").run(testDid);
    }
  });
});
