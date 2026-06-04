/**
 * Tests for the model registry API routes:
 *   GET/POST /api/models
 *   GET/PUT/DELETE /api/models/[id]
 *   GET/POST/DELETE /api/models/[id]/realms
 *
 * Uses the same mocking strategy as security.test.ts:
 *   - vi.mock("@/lib/auth-utils") controls the current user
 *   - vi.mock("@/lib/ws-server") stubs the WS server
 *   - vi.mock("@/lib/litellm-client") stubs LiteLLM calls
 *   - getDb() is used directly for DB setup and teardown
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
// Mocks — declared before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
  forbidden: () => ({
    _body: { error: "Forbidden" },
    _status: 403,
    async json() {
      return { error: "Forbidden" };
    },
  }),
  unauthorized: () => ({
    _body: { error: "Not authenticated" },
    _status: 401,
    async json() {
      return { error: "Not authenticated" };
    },
  }),
}));

vi.mock("@/lib/ws-server", () => ({
  getWSServer: vi.fn(() => ({
    sendLlmConfig: vi.fn(() => false),
  })),
}));

vi.mock("@/lib/litellm-client", () => ({
  isLiteLLMConfigured: vi.fn(() => false),
  getLiteLLMBaseUrl: vi.fn(() => undefined),
  registerModel: vi.fn(() => Promise.resolve()),
  removeModel: vi.fn(() => Promise.resolve()),
  createRealmKey: vi.fn(() =>
    Promise.resolve({ virtualKey: "sk-mock-virtual-key" })
  ),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getDb } from "../packages/control-plane/lib/db";
import { prisma } from "../packages/control-plane/db/client";
import { ModelDAO } from "../packages/control-plane/db";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import {
  isLiteLLMConfigured,
  registerModel,
  removeModel,
  createRealmKey,
} from "../packages/control-plane/lib/litellm-client";
import { NextRequest } from "next/server";

import {
  GET as modelsGET,
  POST as modelsPOST,
} from "../packages/control-plane/app/api/models/route";
import {
  GET as modelDetailGET,
  PUT as modelDetailPUT,
  DELETE as modelDetailDELETE,
} from "../packages/control-plane/app/api/models/[id]/route";
import {
  GET as modelRealmsGET,
  POST as modelRealmsPOST,
  DELETE as modelRealmsDELETE,
} from "../packages/control-plane/app/api/models/[id]/realms/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;
const mockIsLiteLLMConfigured = isLiteLLMConfigured as ReturnType<typeof vi.fn>;
const mockRegisterModel = registerModel as ReturnType<typeof vi.fn>;
const mockRemoveModel = removeModel as ReturnType<typeof vi.fn>;
const mockCreateRealmKey = createRealmKey as ReturnType<typeof vi.fn>;

function makeAdminContext() {
  return {
    did: "did:test:admin",
    isGlobalAdmin: true,
    isOwner: true,
    canAdminRealm: () => true,
  };
}

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    url,
    body !== undefined ? { body } : undefined
  ) as unknown as NextRequest;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Sentinel prefix to identify and clean up test rows
const T = "test:models-routes:";

// ---------------------------------------------------------------------------
// DB setup: ensure a default realm exists so realm operations work
// ---------------------------------------------------------------------------

let testRealmId: string;

beforeAll(async () => {
  const db = getDb();
  testRealmId = `${T}realm-1`;
  db.prepare(`INSERT OR IGNORE INTO realms (id, name, slug, color, is_default) VALUES (?, 'Test Realm', 'test-realm-mr', '#6366f1', 0)`).run(testRealmId);
  await prisma.realm.upsert({ where: { id: testRealmId }, create: { id: testRealmId, name: "Test Realm", slug: "test-realm-mr", color: "#6366f1" }, update: {} });
});

afterAll(async () => {
  const db = getDb();
  db.prepare("DELETE FROM model_realm_access WHERE realm_id = ?").run(testRealmId);
  db.prepare("DELETE FROM realm_router_keys WHERE realm_id = ?").run(testRealmId);
  db.prepare("DELETE FROM model_registry WHERE id LIKE ?").run(`${T}%`);
  db.prepare("DELETE FROM realms WHERE id = ?").run(testRealmId);
  await prisma.modelRealmAccess.deleteMany({ where: { realmId: testRealmId } });
  await prisma.realmRouterKey.deleteMany({ where: { realmId: testRealmId } });
  await prisma.modelRegistry.deleteMany({ where: { id: { startsWith: T } } });
  await prisma.realm.deleteMany({ where: { id: testRealmId } });
});

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue(makeAdminContext());
  mockIsLiteLLMConfigured.mockReturnValue(false);
  mockRegisterModel.mockResolvedValue(undefined);
  mockRemoveModel.mockResolvedValue(undefined);
  mockCreateRealmKey.mockResolvedValue({ virtualKey: "sk-mock-virtual-key" });
});

// ---------------------------------------------------------------------------
// GET /api/models
// ---------------------------------------------------------------------------

describe("GET /api/models", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValueOnce(null);
    const res = await modelsGET();
    expect(res._status).toBe(401);
  });

  it("returns all models for global admin", async () => {
    const db = getDb();
    const id = `${T}get-list-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, status, created_by) VALUES (?, 'Test Model', null, 'ollama', 'llama3:8b', 'http://localhost:11434', 'active', 'did:test:admin')`).run(id);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Test Model", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    try {
      const res = await modelsGET();
      expect(res._status).toBe(200);
      const body = (await res.json()) as { models: { id: string }[] };
      expect(body.models.some((m) => m.id === id)).toBe(true);
    } finally {
      db.prepare("DELETE FROM model_registry WHERE id = ?").run(id);
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/models
// ---------------------------------------------------------------------------

describe("POST /api/models", () => {
  it("returns 403 for non-admin", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      ...makeAdminContext(),
      isGlobalAdmin: false,
      isOwner: false,
    });
    const r = req("POST", "http://localhost/api/models", {
      name: "X",
      provider: "ollama",
      modelId: "x",
      baseUrl: "http://x",
    });
    const res = await modelsPOST(r as any);
    expect(res._status).toBe(403);
  });

  it("creates a model entry in the DB", async () => {
    const r = req("POST", "http://localhost/api/models", {
      name: `${T}create-test`,
      provider: "openai-compatible",
      modelId: "ministral-3b",
      baseUrl: "http://localhost:11434",
      description: "test model",
    });
    const res = await modelsPOST(r as any);
    expect(res._status).toBe(201);
    const body = (await res.json()) as { model: { id: string } };
    expect(body.model.id).toBeTruthy();

    // Cleanup
    getDb()
      .prepare("DELETE FROM model_registry WHERE id = ?")
      .run(body.model.id);
  });

  it("calls registerModel when LiteLLM is configured", async () => {
    mockIsLiteLLMConfigured.mockReturnValue(true);

    const r = req("POST", "http://localhost/api/models", {
      name: `${T}litellm-reg`,
      provider: "openai-compatible",
      modelId: "llama3-ft",
      baseUrl: "http://vllm:8080",
    });
    const res = await modelsPOST(r as any);
    expect(res._status).toBe(201);
    expect(mockRegisterModel).toHaveBeenCalledOnce();

    const body = (await res.json()) as { model: { id: string } };
    getDb()
      .prepare("DELETE FROM model_registry WHERE id = ?")
      .run(body.model.id);
  });

  it("succeeds even when LiteLLM registerModel fails (non-fatal)", async () => {
    mockIsLiteLLMConfigured.mockReturnValue(true);
    mockRegisterModel.mockRejectedValueOnce(new Error("LiteLLM unreachable"));

    const r = req("POST", "http://localhost/api/models", {
      name: `${T}litellm-fail`,
      provider: "ollama",
      modelId: "llama3:8b",
      baseUrl: "http://localhost:11434",
    });
    const res = await modelsPOST(r as any);
    expect(res._status).toBe(201);

    const body = (await res.json()) as { model: { id: string } };
    getDb()
      .prepare("DELETE FROM model_registry WHERE id = ?")
      .run(body.model.id);
  });
});

// ---------------------------------------------------------------------------
// GET /api/models/[id]
// ---------------------------------------------------------------------------

describe("GET /api/models/[id]", () => {
  it("returns 404 for unknown id", async () => {
    const res = await modelDetailGET(
      req("GET", "http://localhost/api/models/nope") as any,
      params("nope")
    );
    expect(res._status).toBe(404);
  });

  it("returns model detail for known id", async () => {
    const db = getDb();
    const id = `${T}detail-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, status, created_by) VALUES (?, 'Detail Model', 'desc', 'ollama', 'llama3:8b', 'http://localhost:11434', 'active', 'did:test:admin')`).run(id);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Detail Model", description: "desc", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    try {
      const res = await modelDetailGET(req("GET", `http://localhost/api/models/${id}`) as any, params(id));
      expect(res._status).toBe(200);
      const body = (await res.json()) as { model: { id: string; name: string } };
      expect(body.model.id).toBe(id);
      expect(body.model.name).toBe("Detail Model");
    } finally {
      db.prepare("DELETE FROM model_registry WHERE id = ?").run(id);
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/models/[id]
// ---------------------------------------------------------------------------

describe("PUT /api/models/[id]", () => {
  it("updates model name and description", async () => {
    const db = getDb();
    const id = `${T}update-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, status, created_by) VALUES (?, 'Old Name', 'old desc', 'ollama', 'llama3:8b', 'http://old', 'active', 'did:test:admin')`).run(id);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Old Name", description: "old desc", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://old", status: "active" }, update: {} });
    try {
      const r = req("PUT", `http://localhost/api/models/${id}`, { name: "New Name", description: "new desc" });
      const res = await modelDetailPUT(r as any, params(id));
      expect(res._status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
      const updated = await ModelDAO.findById(id);
      expect(updated?.name).toBe("New Name");
    } finally {
      db.prepare("DELETE FROM model_registry WHERE id = ?").run(id);
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/models/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/models/[id]", () => {
  it("removes the model from DB", async () => {
    const db = getDb();
    const id = `${T}delete-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, status, created_by) VALUES (?, 'Delete Me', null, 'ollama', 'llama3:8b', 'http://localhost:11434', 'active', 'did:test:admin')`).run(id);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Delete Me", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });

    const res = await modelDetailDELETE(req("DELETE", `http://localhost/api/models/${id}`) as any, params(id));
    expect(res._status).toBe(200);

    const row = await ModelDAO.findById(id);
    expect(row).toBeNull();
  });

  it("calls removeModel when LiteLLM is configured and litellm_model_name is set", async () => {
    mockIsLiteLLMConfigured.mockReturnValue(true);
    const db = getDb();
    const id = `${T}delete-litellm-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, litellm_model_name, status, created_by) VALUES (?, 'LiteLLM Model', null, 'openai-compatible', 'ft-llama3', 'http://vllm:8080', 'openai-compatible/ft-llama3', 'active', 'did:test:admin')`).run(id);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "LiteLLM Model", provider: "openai-compatible", modelId: "ft-llama3", baseUrl: "http://vllm:8080", litellmModelName: "openai-compatible/ft-llama3", status: "active" }, update: {} });

    await modelDetailDELETE(req("DELETE", `http://localhost/api/models/${id}`) as any, params(id));
    expect(mockRemoveModel).toHaveBeenCalledWith("openai-compatible/ft-llama3");
  });
});

// ---------------------------------------------------------------------------
// POST /api/models/[id]/realms — grant access
// ---------------------------------------------------------------------------

describe("POST /api/models/[id]/realms", () => {
  it("grants realm access and stores it in DB", async () => {
    const db = getDb();
    const id = `${T}realm-grant-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, status, created_by) VALUES (?, 'Realm Model', null, 'ollama', 'llama3:8b', 'http://localhost:11434', 'active', 'did:test:admin')`).run(id);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Realm Model", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    try {
      const r = req("POST", `http://localhost/api/models/${id}/realms`, { realmId: testRealmId });
      const res = await modelRealmsPOST(r as any, params(id));
      expect(res._status).toBe(200);
      const row = await prisma.modelRealmAccess.findUnique({ where: { modelId_realmId: { modelId: id, realmId: testRealmId } } });
      expect(row).toBeTruthy();
    } finally {
      db.prepare("DELETE FROM model_realm_access WHERE model_id = ?").run(id);
      db.prepare("DELETE FROM model_registry WHERE id = ?").run(id);
      await prisma.modelRealmAccess.deleteMany({ where: { modelId: id } });
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });

  it("creates a LiteLLM virtual key when configured and litellm_model_name is set", async () => {
    mockIsLiteLLMConfigured.mockReturnValue(true);
    const db = getDb();
    const id = `${T}realm-grant-litellm-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, litellm_model_name, status, created_by) VALUES (?, 'LiteLLM Realm Model', null, 'openai-compatible', 'ft-v1', 'http://vllm:8080', 'openai-compatible/ft-v1', 'active', 'did:test:admin')`).run(id);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "LiteLLM Realm Model", provider: "openai-compatible", modelId: "ft-v1", baseUrl: "http://vllm:8080", litellmModelName: "openai-compatible/ft-v1", status: "active" }, update: {} });
    try {
      const r = req("POST", `http://localhost/api/models/${id}/realms`, { realmId: testRealmId });
      await modelRealmsPOST(r as any, params(id));
      expect(mockCreateRealmKey).toHaveBeenCalledWith(testRealmId, ["openai-compatible/ft-v1"], undefined);
      const keyRow = await prisma.realmRouterKey.findUnique({ where: { realmId: testRealmId } });
      expect(keyRow?.litellmVirtualKey).toBe("sk-mock-virtual-key");
    } finally {
      db.prepare("DELETE FROM model_realm_access WHERE model_id = ?").run(id);
      db.prepare("DELETE FROM realm_router_keys WHERE realm_id = ?").run(testRealmId);
      db.prepare("DELETE FROM model_registry WHERE id = ?").run(id);
      await prisma.modelRealmAccess.deleteMany({ where: { modelId: id } });
      await prisma.realmRouterKey.deleteMany({ where: { realmId: testRealmId } });
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/models/[id]/realms?realmId=x — revoke access
// ---------------------------------------------------------------------------

describe("DELETE /api/models/[id]/realms", () => {
  it("revokes realm access from DB", async () => {
    const db = getDb();
    const id = `${T}realm-revoke-1`;
    db.prepare(`INSERT OR IGNORE INTO model_registry (id, name, description, provider, model_id, base_url, status, created_by) VALUES (?, 'Revoke Model', null, 'ollama', 'llama3:8b', 'http://localhost:11434', 'active', 'did:test:admin')`).run(id);
    db.prepare("INSERT OR IGNORE INTO model_realm_access (model_id, realm_id) VALUES (?, ?)").run(id, testRealmId);
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Revoke Model", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    await prisma.modelRealmAccess.upsert({ where: { modelId_realmId: { modelId: id, realmId: testRealmId } }, create: { modelId: id, realmId: testRealmId }, update: {} });
    try {
      const r = req("DELETE", `http://localhost/api/models/${id}/realms?realmId=${testRealmId}`);
      const res = await modelRealmsDELETE(r as any, params(id));
      expect(res._status).toBe(200);
      const row = await prisma.modelRealmAccess.findUnique({ where: { modelId_realmId: { modelId: id, realmId: testRealmId } } });
      expect(row).toBeNull();
    } finally {
      db.prepare("DELETE FROM model_realm_access WHERE model_id = ?").run(id);
      db.prepare("DELETE FROM model_registry WHERE id = ?").run(id);
      await prisma.modelRealmAccess.deleteMany({ where: { modelId: id } });
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});
