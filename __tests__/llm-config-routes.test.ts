/**
 * Tests for:
 *   GET/PUT/DELETE /api/agents/[did]/llm-config
 *   GET             /api/agents/[did]/realm-llm
 *
 * Uses the same mocking strategy as security.test.ts.
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
// Mocks
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
    sendLlmConfig: vi.fn(() => true),
  })),
}));

vi.mock("@/lib/litellm-client", () => ({
  isLiteLLMConfigured: vi.fn(() => false),
  getLiteLLMBaseUrl: vi.fn(() => "http://litellm:4000"),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { prisma } from "../packages/control-plane/db/client";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { NextRequest } from "next/server";

import {
  GET as llmConfigGET,
  PUT as llmConfigPUT,
  DELETE as llmConfigDELETE,
} from "../packages/control-plane/app/api/agents/[did]/llm-config/route";
import { GET as realmLlmGET } from "../packages/control-plane/app/api/agents/[did]/realm-llm/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;

function adminContext() {
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

function params(did: string) {
  return { params: Promise.resolve({ did }) };
}

// Sentinel prefix
const T = "did:test:llm-config-routes:";

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

let agentDid: string;
let testRealmId: string;
let modelId: string;

beforeAll(async () => {
  agentDid = `${T}agent-1`;
  testRealmId = `${T}realm-1`;
  modelId = `${T}model-1`;

  await prisma.agent.upsert({ where: { did: agentDid }, create: { did: agentDid, name: "Test Agent", capabilities: [] }, update: {} });
  await prisma.realm.upsert({ where: { id: testRealmId }, create: { id: testRealmId, name: "Test Realm", slug: "test-realm-llmcfg", color: "#6366f1" }, update: {} });
  await prisma.agentRealm.upsert({ where: { agentDid_realmId: { agentDid, realmId: testRealmId } }, create: { agentDid, realmId: testRealmId, isPrimary: true }, update: {} });
  await prisma.modelRegistry.upsert({ where: { id: modelId }, create: { id: modelId, name: "Test Model", provider: "openai-compatible", modelId: "ft-model", baseUrl: "http://vllm:8080", litellmModelName: "openai-compatible/ft-model", status: "active" }, update: {} });
  await prisma.modelRealmAccess.upsert({ where: { modelId_realmId: { modelId, realmId: testRealmId } }, create: { modelId, realmId: testRealmId }, update: {} });
  await prisma.realmRouterKey.upsert({ where: { realmId: testRealmId }, create: { realmId: testRealmId, litellmVirtualKey: "sk-test-virtual-key", allowedModelIds: ["openai-compatible/ft-model"] }, update: {} });
});

afterAll(async () => {
  await prisma.realmRouterKey.deleteMany({ where: { realmId: testRealmId } });
  await prisma.modelRealmAccess.deleteMany({ where: { realmId: testRealmId } });
  await prisma.agentRealm.deleteMany({ where: { agentDid } });
  await prisma.modelRegistry.deleteMany({ where: { id: modelId } });
  await prisma.realm.deleteMany({ where: { id: testRealmId } });
  await prisma.agent.deleteMany({ where: { did: agentDid } });
});

beforeEach(async () => {
  mockGetAuthContext.mockResolvedValue(adminContext());
  await prisma.agent.updateMany({ where: { did: agentDid }, data: { llmConfig: null } });
});

// ---------------------------------------------------------------------------
// GET /api/agents/[did]/llm-config
// ---------------------------------------------------------------------------

describe("GET /api/agents/[did]/llm-config", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await llmConfigGET(
      req("GET", "http://localhost") as any,
      params(agentDid)
    );
    expect(res._status).toBe(401);
  });

  it("returns config: null when no config is set", async () => {
    const res = await llmConfigGET(
      req("GET", "http://localhost") as any,
      params(agentDid)
    );
    expect(res._status).toBe(200);
    const body = (await res.json()) as { config: null };
    expect(body.config).toBeNull();
  });

  it("returns config with API key masked", async () => {
    const cfg = { provider: "openai", model: "gpt-4o", apiKey: "sk-secret-123" };
    await prisma.agent.updateMany({ where: { did: agentDid }, data: { llmConfig: cfg } });

    const res = await llmConfigGET(
      req("GET", "http://localhost") as any,
      params(agentDid)
    );
    const body = (await res.json()) as {
      config: { apiKeySet: boolean; apiKey?: string };
    };
    expect(body.config.apiKeySet).toBe(true);
    expect(body.config.apiKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agents/[did]/llm-config — manual config
// ---------------------------------------------------------------------------

describe("PUT /api/agents/[did]/llm-config (manual)", () => {
  it("validates and stores a manual config", async () => {
    const r = req("PUT", "http://localhost", {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test-key",
    });
    const res = await llmConfigPUT(r as any, params(agentDid));
    expect(res._status).toBe(200);
    const body = (await res.json()) as {
      pushed: boolean;
      config: { model: string };
    };
    expect(body.pushed).toBeDefined();
    expect(body.config.model).toBe("gpt-4o-mini");
  });

  it("rejects invalid provider", async () => {
    const r = req("PUT", "http://localhost", {
      provider: "bad-provider",
      model: "x",
    });
    const res = await llmConfigPUT(r as any, params(agentDid));
    expect(res._status).toBe(400);
  });

  it("rejects empty model", async () => {
    const r = req("PUT", "http://localhost", { provider: "openai", model: "" });
    const res = await llmConfigPUT(r as any, params(agentDid));
    expect(res._status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agents/[did]/llm-config — registryModelId shortcut
// ---------------------------------------------------------------------------

describe("PUT /api/agents/[did]/llm-config (registryModelId)", () => {
  it("resolves config from registry model server-side", async () => {
    const r = req("PUT", "http://localhost", { registryModelId: modelId });
    const res = await llmConfigPUT(r as any, params(agentDid));
    expect(res._status).toBe(200);
    const body = (await res.json()) as {
      pushed: boolean;
      config: { model: string };
    };
    expect(body.pushed).toBeDefined();
    expect(body.config.model).toBe("ft-model");
    // API key must not be in the response
    expect((body.config as any).apiKey).toBeUndefined();
  });

  it("returns 404 for unknown registryModelId", async () => {
    const r = req("PUT", "http://localhost", {
      registryModelId: "does-not-exist",
    });
    const res = await llmConfigPUT(r as any, params(agentDid));
    expect(res._status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agents/[did]/llm-config — realmId + realmModelId shortcut
// ---------------------------------------------------------------------------

describe("PUT /api/agents/[did]/llm-config (realmId + realmModelId)", () => {
  it("resolves virtual key and model from realm", async () => {
    const r = req("PUT", "http://localhost", {
      realmId: testRealmId,
      realmModelId: modelId,
    });
    const res = await llmConfigPUT(r as any, params(agentDid));
    expect(res._status).toBe(200);
    const body = (await res.json()) as {
      pushed: boolean;
      config: { model: string; apiKeySet: boolean };
    };
    expect(body.pushed).toBeDefined();
    // Should use the litellm_model_name, not the plain model_id
    expect(body.config.model).toBe("openai-compatible/ft-model");
    expect(body.config.apiKeySet).toBe(true);
    expect((body.config as any).apiKey).toBeUndefined();
  });

  it("returns 400 when realm has no virtual key", async () => {
    const emptyRealmId = `${T}no-key-realm`;
    await prisma.realm.upsert({ where: { id: emptyRealmId }, create: { id: emptyRealmId, name: "NKR", slug: "nkr", color: "#000" }, update: {} });

    try {
      const r = req("PUT", "http://localhost", { realmId: emptyRealmId, realmModelId: modelId });
      const res = await llmConfigPUT(r as any, params(agentDid));
      expect(res._status).toBe(400);
    } finally {
      await prisma.realm.deleteMany({ where: { id: emptyRealmId } });
    }
  });

  it("returns 404 when model is not in realm", async () => {
    const r = req("PUT", "http://localhost", {
      realmId: testRealmId,
      realmModelId: "does-not-exist",
    });
    const res = await llmConfigPUT(r as any, params(agentDid));
    expect(res._status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/[did]/llm-config
// ---------------------------------------------------------------------------

describe("DELETE /api/agents/[did]/llm-config", () => {
  it("clears the stored config", async () => {
    const cfg = { provider: "openai", model: "gpt-4o" };
    await prisma.agent.updateMany({ where: { did: agentDid }, data: { llmConfig: cfg } });

    const res = await llmConfigDELETE(req("DELETE", "http://localhost") as any, params(agentDid));
    expect(res._status).toBe(200);
    const body = (await res.json()) as { pushed: boolean };
    expect(body.pushed).toBeDefined();

    const agent = await prisma.agent.findUnique({ where: { did: agentDid } });
    expect(agent?.llmConfig).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/[did]/realm-llm
// ---------------------------------------------------------------------------

describe("GET /api/agents/[did]/realm-llm", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValueOnce(new APIException("UNAUTHORIZED"));
    const res = await realmLlmGET(
      req("GET", "http://localhost") as any,
      params(agentDid)
    );
    expect(res._status).toBe(401);
  });

  it("returns realm options with models and virtual key status", async () => {
    const res = await realmLlmGET(
      req("GET", "http://localhost") as any,
      params(agentDid)
    );
    expect(res._status).toBe(200);
    const body = (await res.json()) as {
      litellmBaseUrl: string;
      realms: {
        realmId: string;
        hasVirtualKey: boolean;
        models: { id: string }[];
      }[];
    };
    const realm = body.realms.find((r) => r.realmId === testRealmId);
    expect(realm).toBeTruthy();
    expect(realm!.hasVirtualKey).toBe(true);
    expect(realm!.models.some((m) => m.id === modelId)).toBe(true);
  });

  it("returns 404 for unknown agent", async () => {
    const res = await realmLlmGET(
      req("GET", "http://localhost") as any,
      params("did:test:does-not-exist")
    );
    expect(res._status).toBe(404);
  });
});
