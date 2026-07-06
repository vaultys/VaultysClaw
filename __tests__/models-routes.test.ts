/**
 * Tests for the model registry API routes:
 *   GET/POST /api/models
 *   GET/PUT/DELETE /api/models/[id]
 *   GET/POST/DELETE /api/models/[id]/workspaces
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
  createWorkspaceKey: vi.fn(() =>
    Promise.resolve({ virtualKey: "sk-mock-virtual-key" })
  ),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { prisma } from "../packages/control-plane/db/client";
import { ModelDAO } from "../packages/control-plane/db";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import {
  isLiteLLMConfigured,
  registerModel,
  removeModel,
  createWorkspaceKey,
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
  GET as modelWorkspacesGET,
  POST as modelWorkspacesPOST,
  DELETE as modelWorkspacesDELETE,
} from "../packages/control-plane/app/api/models/[id]/workspaces/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;
const mockIsLiteLLMConfigured = isLiteLLMConfigured as ReturnType<typeof vi.fn>;
const mockRegisterModel = registerModel as ReturnType<typeof vi.fn>;
const mockRemoveModel = removeModel as ReturnType<typeof vi.fn>;
const mockCreateWorkspaceKey = createWorkspaceKey as ReturnType<typeof vi.fn>;

function makeAdminContext() {
  return {
    did: "did:test:admin",
    isGlobalAdmin: true,
    isOwner: true,
    canAdminWorkspace: () => true,
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
// DB setup: ensure a default workspace exists so workspace operations work
// ---------------------------------------------------------------------------

let testWorkspaceId: string;

beforeAll(async () => {
  testWorkspaceId = `${T}workspace-1`;
  await prisma.workspace.upsert({ where: { id: testWorkspaceId }, create: { id: testWorkspaceId, name: "Test Workspace", slug: "test-workspace-mr", color: "#6366f1" }, update: {} });
});

afterAll(async () => {
  await prisma.modelWorkspaceAccess.deleteMany({ where: { workspaceId: testWorkspaceId } });
  await prisma.workspaceRouterKey.deleteMany({ where: { workspaceId: testWorkspaceId } });
  await prisma.modelRegistry.deleteMany({ where: { id: { startsWith: T } } });
  await prisma.workspace.deleteMany({ where: { id: testWorkspaceId } });
});

beforeEach(() => {
  mockGetAuthContext.mockResolvedValue(makeAdminContext());
  mockIsLiteLLMConfigured.mockReturnValue(false);
  mockRegisterModel.mockResolvedValue(undefined);
  mockRemoveModel.mockResolvedValue(undefined);
  mockCreateWorkspaceKey.mockResolvedValue({ virtualKey: "sk-mock-virtual-key" });
});

// ---------------------------------------------------------------------------
// GET /api/models
// ---------------------------------------------------------------------------

describe("GET /api/models", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await modelsGET(req("GET", "http://localhost/api/models") as any);
    expect(res._status).toBe(401);
  });

  it("returns all models for global admin", async () => {
    const id = `${T}get-list-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Test Model", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    try {
      const res = await modelsGET(req("GET", "http://localhost/api/models") as any);
      expect(res._status).toBe(200);
      const body = (await res.json()) as { models: { id: string }[] };
      expect(body.models.some((m) => m.id === id)).toBe(true);
    } finally {
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
    await prisma.modelRegistry.deleteMany({ where: { id: body.model.id } });
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
    await prisma.modelRegistry.deleteMany({ where: { id: body.model.id } });
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
    await prisma.modelRegistry.deleteMany({ where: { id: body.model.id } });
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
    const id = `${T}detail-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Detail Model", description: "desc", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    try {
      const res = await modelDetailGET(req("GET", `http://localhost/api/models/${id}`) as any, params(id));
      expect(res._status).toBe(200);
      const body = (await res.json()) as { model: { id: string; name: string } };
      expect(body.model.id).toBe(id);
      expect(body.model.name).toBe("Detail Model");
    } finally {
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/models/[id]
// ---------------------------------------------------------------------------

describe("PUT /api/models/[id]", () => {
  it("updates model name and description", async () => {
    const id = `${T}update-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Old Name", description: "old desc", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://old", status: "active" }, update: {} });
    try {
      const r = req("PUT", `http://localhost/api/models/${id}`, { name: "New Name", description: "new desc" });
      const res = await modelDetailPUT(r as any, params(id));
      expect(res._status).toBe(200);
      const updated = await ModelDAO.findById(id);
      expect(updated?.name).toBe("New Name");
    } finally {
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/models/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/models/[id]", () => {
  it("removes the model from DB", async () => {
    const id = `${T}delete-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Delete Me", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });

    const res = await modelDetailDELETE(req("DELETE", `http://localhost/api/models/${id}`) as any, params(id));
    expect(res._status).toBe(200);

    const row = await ModelDAO.findById(id);
    expect(row).toBeNull();
  });

  it("calls removeModel when LiteLLM is configured and litellm_model_name is set", async () => {
    mockIsLiteLLMConfigured.mockReturnValue(true);
    const id = `${T}delete-litellm-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "LiteLLM Model", provider: "openai-compatible", modelId: "ft-llama3", baseUrl: "http://vllm:8080", litellmModelName: "openai-compatible/ft-llama3", status: "active" }, update: {} });

    await modelDetailDELETE(req("DELETE", `http://localhost/api/models/${id}`) as any, params(id));
    expect(mockRemoveModel).toHaveBeenCalledWith("openai-compatible/ft-llama3");
  });
});

// ---------------------------------------------------------------------------
// POST /api/models/[id]/workspaces — grant access
// ---------------------------------------------------------------------------

describe("POST /api/models/[id]/workspaces", () => {
  it("grants workspace access and stores it in DB", async () => {
    const id = `${T}workspace-grant-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Workspace Model", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    try {
      const r = req("POST", `http://localhost/api/models/${id}/workspaces`, { workspaceId: testWorkspaceId });
      const res = await modelWorkspacesPOST(r as any, params(id));
      expect(res._status).toBe(200);
      const row = await prisma.modelWorkspaceAccess.findUnique({ where: { modelId_workspaceId: { modelId: id, workspaceId: testWorkspaceId } } });
      expect(row).toBeTruthy();
    } finally {
      await prisma.modelWorkspaceAccess.deleteMany({ where: { modelId: id } });
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });

  it("creates a LiteLLM virtual key when configured and litellm_model_name is set", async () => {
    mockIsLiteLLMConfigured.mockReturnValue(true);
    const id = `${T}workspace-grant-litellm-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "LiteLLM Workspace Model", provider: "openai-compatible", modelId: "ft-v1", baseUrl: "http://vllm:8080", litellmModelName: "openai-compatible/ft-v1", status: "active" }, update: {} });
    try {
      const r = req("POST", `http://localhost/api/models/${id}/workspaces`, { workspaceId: testWorkspaceId });
      await modelWorkspacesPOST(r as any, params(id));
      expect(mockCreateWorkspaceKey).toHaveBeenCalledWith(testWorkspaceId, ["openai-compatible/ft-v1"], undefined);
      const keyRow = await prisma.workspaceRouterKey.findUnique({ where: { workspaceId: testWorkspaceId } });
      expect(keyRow?.litellmVirtualKey).toBe("sk-mock-virtual-key");
    } finally {
      await prisma.modelWorkspaceAccess.deleteMany({ where: { modelId: id } });
      await prisma.workspaceRouterKey.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/models/[id]/workspaces?workspaceId=x — revoke access
// ---------------------------------------------------------------------------

describe("DELETE /api/models/[id]/workspaces", () => {
  it("revokes workspace access from DB", async () => {
    const id = `${T}workspace-revoke-1`;
    await prisma.modelRegistry.upsert({ where: { id }, create: { id, name: "Revoke Model", provider: "ollama", modelId: "llama3:8b", baseUrl: "http://localhost:11434", status: "active" }, update: {} });
    await prisma.modelWorkspaceAccess.upsert({ where: { modelId_workspaceId: { modelId: id, workspaceId: testWorkspaceId } }, create: { modelId: id, workspaceId: testWorkspaceId }, update: {} });
    try {
      const r = req("DELETE", `http://localhost/api/models/${id}/workspaces?workspaceId=${testWorkspaceId}`);
      const res = await modelWorkspacesDELETE(r as any, params(id));
      expect(res._status).toBe(200);
      const row = await prisma.modelWorkspaceAccess.findUnique({ where: { modelId_workspaceId: { modelId: id, workspaceId: testWorkspaceId } } });
      expect(row).toBeNull();
    } finally {
      await prisma.modelWorkspaceAccess.deleteMany({ where: { modelId: id } });
      await prisma.modelRegistry.deleteMany({ where: { id } });
    }
  });
});
