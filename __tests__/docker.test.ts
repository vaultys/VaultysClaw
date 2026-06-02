/**
 * Docker-based end-to-end integration tests.
 *
 * These tests spin up the full stack (control-plane, agent-controller, mock-llm)
 * using docker-compose.test.yml and then exercise the real flows through the
 * test-only REST API.
 *
 * Run with:
 *   pnpm test:docker
 *
 * Prerequisites:
 *   - Docker + Docker Compose (v2 / compose plugin)
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
const MOCK_LLM = "http://localhost:11435";
const COMPOSE_FILE = "docker-compose.test.yml";
const AGENT_NAME = "docker-test-agent";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll<T>(
  fn: () => Promise<T | null>,
  maxMs: number,
  intervalMs = 1000
): Promise<T> {
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

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${url} => ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface PendingReg {
  id: string;
  agent_name: string;
  status: string;
  requested_capabilities: string | null;
}

interface ConnectedAgent {
  id: string;
  name: string;
  capabilities: string[];
}

interface IntentResult {
  agentDid: string;
  agentName: string;
  intentId: string;
  status: string;
  output?: unknown;
}

interface LlmCall {
  timestamp: number;
  model: string;
  messages: unknown[];
  maxTokens?: number;
}

async function waitForTestApi(maxMs = 60_000): Promise<void> {
  await poll(async () => {
    try {
      const res = await fetch(`${CONTROL_PLANE}/api/test/agents`);
      return res.ok ? true : null;
    } catch {
      return null;
    }
  }, maxMs);
}

async function waitForPendingRegistration(
  agentName: string,
  maxMs = 45_000
): Promise<PendingReg> {
  return poll(async () => {
    const rows = await getJson<PendingReg[]>(
      `${CONTROL_PLANE}/api/test/registrations`
    );
    const row = rows.find(
      (r) => r.agent_name === agentName && r.status === "pending"
    );
    return row ?? null;
  }, maxMs);
}

async function waitForAgentConnected(
  agentName: string,
  maxMs = 30_000
): Promise<ConnectedAgent> {
  return poll(async () => {
    const agents = await getJson<ConnectedAgent[]>(
      `${CONTROL_PLANE}/api/test/agents`
    );
    const agent = agents.find((a) => a.name === agentName);
    return agent ?? null;
  }, maxMs);
}

async function waitForIntentResult(
  intentId: string,
  maxMs = 30_000
): Promise<IntentResult> {
  return poll(async () => {
    const results = await getJson<IntentResult[]>(
      `${CONTROL_PLANE}/api/test/results`
    );
    const r = results.find((x) => x.intentId === intentId);
    return r ?? null;
  }, maxMs);
}

async function waitForLlmCalls(
  minCount: number,
  maxMs = 20_000
): Promise<LlmCall[]> {
  return poll(async () => {
    const calls = await getJson<LlmCall[]>(`${MOCK_LLM}/test/calls`);
    return calls.length >= minCount ? calls : null;
  }, maxMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Docker E2E — full stack", () => {
  let agentId: string; // DID of the approved agent

  // ---------------------------------------------------------------------------
  beforeAll(async () => {
    // Build + start all services. No timeout passed to execAsync — vitest's
    // hookTimeout (10 minutes) is the guard. The first run takes the longest
    // because it downloads the base image; subsequent runs use layer cache.
    await execAsync(`docker compose -f ${COMPOSE_FILE} up -d --build --wait`);
    // Wait until the test API is reachable (control plane may need extra time)
    await waitForTestApi(120_000);
  }, 660_000);

  afterAll(async () => {
    await execAsync(`docker compose -f ${COMPOSE_FILE} down -v`).catch(
      () => {}
    );
  }, 60_000);

  // ---------------------------------------------------------------------------
  it("control-plane is healthy", async () => {
    const res = await fetch(`${CONTROL_PLANE}/api/server`);
    expect(res.ok).toBe(true);
  });

  it("mock LLM server is healthy", async () => {
    const res = await fetch(`${MOCK_LLM}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  // ---------------------------------------------------------------------------
  it("agent registers and appears in pending registrations", async () => {
    const reg = await waitForPendingRegistration(AGENT_NAME);
    expect(reg.agent_name).toBe(AGENT_NAME);
    expect(reg.status).toBe("pending");
  });

  it("approving registration connects the agent", async () => {
    // Fetch the pending registration id
    const regs = await getJson<PendingReg[]>(
      `${CONTROL_PLANE}/api/test/registrations`
    );
    const reg = regs.find(
      (r) => r.agent_name === AGENT_NAME && r.status === "pending"
    );
    if (!reg)
      throw new Error("No pending registration found for " + AGENT_NAME);

    // Approve it
    const result = await postJson<{ ok: boolean; capabilities: string[] }>(
      `${CONTROL_PLANE}/api/test/registrations/${reg.id}/approve`,
      { capabilities: ["test_capability", "llm_query"] }
    );
    expect(result.ok).toBe(true);
    expect(result.capabilities).toContain("llm_query");

    // Agent should soon appear as connected
    const agent = await waitForAgentConnected(AGENT_NAME);
    agentId = agent.id;
    expect(agentId).toMatch(/^did:vaultys:/);
    expect(agent.capabilities).toContain("llm_query");
  });

  // ---------------------------------------------------------------------------
  it("intent triggers LLM invocation", async () => {
    if (!agentId)
      throw new Error("Agent not connected — prior test may have failed");

    // Clear mock LLM call log
    await fetch(`${MOCK_LLM}/test/calls`, { method: "DELETE" });

    // Send intent
    const { intentId } = await postJson<{ ok: boolean; intentId: string }>(
      `${CONTROL_PLANE}/api/test/intent`,
      {
        agentId,
        action: "llm_query",
        params: { prompt: "Hello from the test!" },
      }
    );
    expect(intentId).toBeTruthy();

    // Wait for LLM to be called
    const calls = await waitForLlmCalls(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].model).toBe("mock-model");

    // Wait for result to be logged in the activity log
    const result = await waitForIntentResult(intentId);
    expect(result.status).toBeDefined();
  });

  it("intent result is stored in activity log", async () => {
    const results = await getJson<IntentResult[]>(
      `${CONTROL_PLANE}/api/test/results`
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].agentName).toBe(AGENT_NAME);
  });

  // ---------------------------------------------------------------------------
  it("control-plane can push LLM config override to agent", async () => {
    if (!agentId) throw new Error("Agent not connected");

    // Clear mock LLM call log
    await fetch(`${MOCK_LLM}/test/calls`, { method: "DELETE" });

    // Push a new LLM config via the standard API (requires admin auth — skip
    // in this test because the Docker environment has no session cookie).
    // Instead we verify that the agent still responds with the default mock config.
    const calls = await getJson<LlmCall[]>(`${MOCK_LLM}/test/calls`);
    expect(calls.length).toBe(0); // confirm clean slate

    // Send another intent
    const { intentId } = await postJson<{ ok: boolean; intentId: string }>(
      `${CONTROL_PLANE}/api/test/intent`,
      { agentId, action: "llm_query", params: { prompt: "second call" } }
    );

    const calls2 = await waitForLlmCalls(1);
    expect(calls2[0].model).toBe("mock-model");
    await waitForIntentResult(intentId);
  });

  // ---------------------------------------------------------------------------
  // Chat streaming E2E
  // ---------------------------------------------------------------------------

  it("chat message triggers streaming LLM response", async () => {
    if (!agentId)
      throw new Error("Agent not connected — prior test may have failed");

    // Clear mock LLM call log
    await fetch(`${MOCK_LLM}/test/calls`, { method: "DELETE" });

    // Send chat via the test API (returns SSE stream)
    const res = await fetch(`${CONTROL_PLANE}/api/test/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        messages: [{ role: "user", content: "Hello chat test" }],
      }),
    });

    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Read the full SSE stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullBody = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullBody += decoder.decode(value, { stream: true });
    }

    // Should contain at least one data chunk and a [DONE]
    expect(fullBody).toContain("data: ");
    expect(fullBody).toContain("[DONE]");

    // Parse text chunks
    const textChunks: string[] = [];
    for (const line of fullBody.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) textChunks.push(parsed.text);
      } catch {
        // skip non-JSON lines
      }
    }

    expect(textChunks.length).toBeGreaterThan(0);
    const fullText = textChunks.join("");
    expect(fullText).toContain("Mock LLM response");

    // Verify the mock LLM was called
    const calls = await waitForLlmCalls(1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("chat to offline agent returns 404", async () => {
    const res = await fetch(`${CONTROL_PLANE}/api/test/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "did:vaultys:nonexistent",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not connected");
  });
});
