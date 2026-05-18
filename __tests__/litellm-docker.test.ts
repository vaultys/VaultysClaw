/**
 * Docker-based integration tests for the LiteLLM pipeline.
 *
 * Spins up: mock-litellm + mock-llm + control-plane + agent
 * (via docker-compose.litellm.yml) and exercises the full
 * model registry → realm access → agent routing flow.
 *
 * Run with:
 *   pnpm test:litellm
 *
 * Prerequisites:
 *   - Docker + Docker Compose v2
 *   - All images build successfully
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CONTROL_PLANE = "http://localhost:13000";
const MOCK_LITELLM = "http://localhost:14000";
const COMPOSE_FILE = "docker-compose.litellm.yml";
const AGENT_NAME = "litellm-test-agent";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll<T>(fn: () => Promise<T | null>, maxMs: number, intervalMs = 1000): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null && result !== undefined) return result;
    await sleep(intervalMs);
  }
  throw new Error(`poll timed out after ${maxMs}ms`);
}

async function getJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} => ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T = unknown>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${url} => ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function deleteJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DELETE ${url} => ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function waitForTestApi(maxMs = 90_000): Promise<void> {
  await poll(async () => {
    try {
      const res = await fetch(`${CONTROL_PLANE}/api/test/agents`);
      return res.ok ? true : null;
    } catch {
      return null;
    }
  }, maxMs);
}

async function waitForAgentConnected(name: string, maxMs = 45_000) {
  return poll(async () => {
    const agents = await getJson<{ id: string; name: string }[]>(`${CONTROL_PLANE}/api/test/agents`);
    return agents.find((a) => a.name === name) ?? null;
  }, maxMs);
}

async function waitForPendingReg(name: string, maxMs = 45_000) {
  return poll(async () => {
    const rows = await getJson<{ id: string; agent_name: string; status: string }[]>(
      `${CONTROL_PLANE}/api/test/registrations`,
    );
    return rows.find((r) => r.agent_name === name && r.status === "pending") ?? null;
  }, maxMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Docker E2E — LiteLLM pipeline", () => {
  let agentId: string;

  beforeAll(async () => {
    // Clean up any leftover containers from a previous run before starting
    await execAsync(`docker compose -f ${COMPOSE_FILE} down -v --remove-orphans`).catch(() => {});
    // Build separately first — combining --build with --wait can race on Mac/BuildKit
    // where images aren't loaded into the daemon before container creation starts.
    await execAsync(`docker compose -f ${COMPOSE_FILE} build`);
    await execAsync(`docker compose -f ${COMPOSE_FILE} up -d --wait`);
    await waitForTestApi(120_000);
  }, 660_000);

  afterAll(async () => {
    await execAsync(`docker compose -f ${COMPOSE_FILE} down -v`).catch(() => {});
  }, 60_000);

  // ---------------------------------------------------------------------------
  // Infrastructure health
  // ---------------------------------------------------------------------------

  it("control-plane is healthy", async () => {
    const res = await fetch(`${CONTROL_PLANE}/api/server`);
    expect(res.ok).toBe(true);
  });

  it("mock-litellm proxy is healthy", async () => {
    const res = await fetch(`${MOCK_LITELLM}/health/liveliness`);
    expect(res.ok).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Agent registration
  // ---------------------------------------------------------------------------

  it("agent registers and can be approved", async () => {
    const reg = await waitForPendingReg(AGENT_NAME);
    expect(reg.agent_name).toBe(AGENT_NAME);

    await postJson(`${CONTROL_PLANE}/api/test/registrations/${reg.id}/approve`, {});

    const connected = await waitForAgentConnected(AGENT_NAME);
    agentId = connected.id;
    expect(agentId).toBeTruthy();
  }, 60_000);

  // ---------------------------------------------------------------------------
  // Model registry
  // ---------------------------------------------------------------------------

  it("creates a model and it appears in the registry", async () => {
    const body = await postJson<{ model: { id: string; name: string } }>(
      `${CONTROL_PLANE}/api/test/models`,
      {
        name: "ft-test-model",
        provider: "openai-compatible",
        modelId: "ft-llama3-8b",
        baseUrl: "http://mock-llm:11435/v1",
        description: "Docker test model",
      },
    );

    expect(body.model.id).toBeTruthy();
    expect(body.model.name).toBe("ft-test-model");
  });

  it("registered model appears in mock-litellm", async () => {
    const data = await getJson<{ models: Record<string, unknown> }>(`${MOCK_LITELLM}/test/models`);
    const modelNames = Object.keys(data.models);
    // At least one model whose name contains our model slug
    expect(modelNames.some((n) => n.includes("ft-test-model"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Realm access + virtual key
  // ---------------------------------------------------------------------------

  it("grants model to a realm and a virtual key is generated in mock-litellm", async () => {
    // Get the model id
    const models = await getJson<{ models: { id: string; name: string }[] }>(
      `${CONTROL_PLANE}/api/test/models`,
    );
    const model = models.models.find((m) => m.name === "ft-test-model");
    expect(model).toBeTruthy();

    // Get the default realm id
    const realms = await getJson<{ realms: { id: string; isDefault: boolean }[] }>(
      `${CONTROL_PLANE}/api/test/realms`,
    );
    const defaultRealm = realms.realms.find((r) => r.isDefault);
    expect(defaultRealm).toBeTruthy();

    // Grant model access to realm
    await postJson(`${CONTROL_PLANE}/api/test/models/${model!.id}/realms`, {
      realmId: defaultRealm!.id,
    });

    // Virtual key should now exist in mock-litellm
    const keys = await getJson<{ keys: Record<string, { key: string }> }>(`${MOCK_LITELLM}/test/keys`);
    const realmKeys = Object.values(keys.keys);
    expect(realmKeys.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Agent LLM config via realm routing
  // ---------------------------------------------------------------------------

  it("agent config can be set to realm routing and config is stored", async () => {
    expect(agentId).toBeTruthy();

    // Fetch realm-llm options
    const realmLlm = await getJson<{
      litellmConfigured: boolean;
      realms: { realmId: string; hasVirtualKey: boolean; models: { id: string }[] }[];
    }>(`${CONTROL_PLANE}/api/test/agents/${agentId}/realm-llm`);

    expect(realmLlm.litellmConfigured).toBe(true);
    const realmWithKey = realmLlm.realms.find((r) => r.hasVirtualKey && r.models.length > 0);
    expect(realmWithKey).toBeTruthy();

    const modelToUse = realmWithKey!.models[0];

    // Push realm routing config
    const result = await postJson<{ ok: boolean; config: { model: string; apiKeySet: boolean } }>(
      `${CONTROL_PLANE}/api/test/agents/${agentId}/llm-config`,
      { realmId: realmWithKey!.realmId, realmModelId: modelToUse.id },
    );

    expect(result.ok).toBe(true);
    expect(result.config.apiKeySet).toBe(true); // virtual key is stored
    expect(result.config.model).toBeTruthy();    // litellm_model_name
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  it("can delete a model and it is removed from mock-litellm", async () => {
    const models = await getJson<{ models: { id: string; name: string }[] }>(
      `${CONTROL_PLANE}/api/test/models`,
    );
    const model = models.models.find((m) => m.name === "ft-test-model");
    if (!model) return; // already cleaned up

    await deleteJson(`${CONTROL_PLANE}/api/test/models/${model.id}`);

    const data = await getJson<{ models: Record<string, unknown> }>(`${MOCK_LITELLM}/test/models`);
    expect(Object.keys(data.models).some((n) => n.includes("ft-test-model"))).toBe(false);
  });
});
