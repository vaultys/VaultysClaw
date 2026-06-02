/**
 * Unit tests for packages/control-plane/lib/litellm-client.ts
 *
 * All HTTP calls are intercepted via vi.stubGlobal("fetch", mockFetch) so
 * no real network traffic is generated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Module under test — imported after stubbing fetch
// ---------------------------------------------------------------------------

import {
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
  registerModel,
  removeModel,
  createRealmKey,
  healthCheck,
  listModels,
} from "../packages/control-plane/lib/litellm-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const ORIG_BASE_URL = process.env.LITELLM_BASE_URL;
const ORIG_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

beforeEach(() => {
  process.env.LITELLM_BASE_URL = "http://localhost:4000";
  process.env.LITELLM_MASTER_KEY = "sk-test-master-key";
  mockFetch.mockReset();
});

afterEach(() => {
  process.env.LITELLM_BASE_URL = ORIG_BASE_URL;
  process.env.LITELLM_MASTER_KEY = ORIG_MASTER_KEY;
});

// ---------------------------------------------------------------------------
// isLiteLLMConfigured
// ---------------------------------------------------------------------------

describe("isLiteLLMConfigured", () => {
  it("returns true when both env vars are set", () => {
    expect(isLiteLLMConfigured()).toBe(true);
  });

  it("returns false when LITELLM_BASE_URL is missing", () => {
    delete process.env.LITELLM_BASE_URL;
    expect(isLiteLLMConfigured()).toBe(false);
  });

  it("returns false when LITELLM_MASTER_KEY is missing", () => {
    delete process.env.LITELLM_MASTER_KEY;
    expect(isLiteLLMConfigured()).toBe(false);
  });

  it("returns false when both env vars are missing", () => {
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_MASTER_KEY;
    expect(isLiteLLMConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLiteLLMBaseUrl
// ---------------------------------------------------------------------------

describe("getLiteLLMBaseUrl", () => {
  it("returns the configured base URL", () => {
    expect(getLiteLLMBaseUrl()).toBe("http://localhost:4000");
  });

  it("returns undefined when not configured", () => {
    delete process.env.LITELLM_BASE_URL;
    expect(getLiteLLMBaseUrl()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// registerModel
// ---------------------------------------------------------------------------

describe("registerModel", () => {
  it("posts to /model/new with correct shape", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));

    await registerModel({
      modelName: "my-fine-tuned",
      litellmModel: "openai/gpt-4o",
      apiBase: "http://vllm:8080/v1",
      apiKey: "sk-vllm",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:4000/model/new");
    expect(init.method).toBe("POST");
    expect(init.headers?.Authorization).toBe("Bearer sk-test-master-key");

    const body = JSON.parse(init.body as string);
    expect(body.model_name).toBe("my-fine-tuned");
    expect(body.litellm_params.model).toBe("openai/gpt-4o");
    expect(body.litellm_params.api_base).toBe("http://vllm:8080/v1");
    expect(body.litellm_params.api_key).toBe("sk-vllm");
  });

  it("omits api_key when not provided", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));

    await registerModel({
      modelName: "m",
      litellmModel: "openai/m",
      apiBase: "http://x",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.litellm_params.api_key).toBeUndefined();
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: "conflict" }, 409));
    await expect(
      registerModel({
        modelName: "m",
        litellmModel: "openai/m",
        apiBase: "http://x",
      })
    ).rejects.toThrow("409");
  });

  it("throws when LiteLLM is not configured", async () => {
    delete process.env.LITELLM_BASE_URL;
    await expect(
      registerModel({
        modelName: "m",
        litellmModel: "openai/m",
        apiBase: "http://x",
      })
    ).rejects.toThrow("LiteLLM not configured");
  });
});

// ---------------------------------------------------------------------------
// removeModel
// ---------------------------------------------------------------------------

describe("removeModel", () => {
  it("posts to /model/delete with model_name", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));

    await removeModel("my-fine-tuned");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:4000/model/delete");
    const body = JSON.parse(init.body as string);
    expect(body.model_name).toBe("my-fine-tuned");
  });

  it("silently ignores 404", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse("not found", 404));
    await expect(removeModel("missing")).resolves.toBeUndefined();
  });

  it("throws on other non-2xx responses", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse("server error", 500));
    await expect(removeModel("m")).rejects.toThrow("500");
  });
});

// ---------------------------------------------------------------------------
// createRealmKey
// ---------------------------------------------------------------------------

describe("createRealmKey", () => {
  it("posts to /key/generate and returns virtualKey", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ key: "sk-realm-abc123" }));

    const result = await createRealmKey("realm-1", ["model-a", "model-b"]);

    expect(result.virtualKey).toBe("sk-realm-abc123");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:4000/key/generate");
    const body = JSON.parse(init.body as string);
    expect(body.team_id).toBe("realm-1");
    expect(body.models).toEqual(["model-a", "model-b"]);
    expect(body.max_budget).toBeUndefined();
  });

  it("includes max_budget when monthlyBudgetUsd is set", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ key: "sk-budgeted" }));

    await createRealmKey("realm-2", ["m"], 50);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.max_budget).toBe(50);
  });

  it("uses all-team-models sentinel when model list is empty", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ key: "sk-all" }));

    await createRealmKey("realm-3", []);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.models).toEqual(["all-team-models"]);
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ error: "bad request" }, 400)
    );
    await expect(createRealmKey("r", ["m"])).rejects.toThrow("400");
  });
});

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------

describe("healthCheck", () => {
  it("returns true when the proxy responds 200", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: "healthy" }));
    expect(await healthCheck()).toBe(true);
  });

  it("returns false on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 503));
    expect(await healthCheck()).toBe(false);
  });

  it("returns false when fetch throws (proxy unreachable)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await healthCheck()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listModels
// ---------------------------------------------------------------------------

describe("listModels", () => {
  it("returns model list from /model/info", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        data: [
          {
            model_name: "ft-llama3",
            litellm_params: { model: "openai/ft-llama3" },
          },
          {
            model_name: "ft-mistral",
            litellm_params: { model: "openai/ft-mistral" },
          },
        ],
      })
    );

    const models = await listModels();
    expect(models).toHaveLength(2);
    expect(models[0].model_name).toBe("ft-llama3");
  });

  it("returns empty array on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));
    expect(await listModels()).toEqual([]);
  });
});
