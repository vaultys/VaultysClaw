/**
 * E2E tests for the reasoning/thinking pipeline against a LIVE dev stack.
 *
 * Exercises the full application path:
 *   control plane (/api/test/chat) → WS → agent → streamChat (llm.ts)
 *   → LM Studio (Qwen3-4B) → reasoning_content → <think> inlining →
 *   splitThinkContent → thinking-tagged SSE chunks
 *
 * Run with:
 *   pnpm vitest run __tests__/reasoning-e2e.test.ts --config vitest.config.reasoning.mjs
 *
 * Prerequisites (dev stack):
 *   - Control plane on :3000 with ENABLE_TEST_API=true
 *   - Agent (default name "L") connected via WS
 *   - LM Studio serving qwen/qwen3-4b (reasoning-capable hybrid model)
 *
 * Overridable via env: CONTROL_PLANE_URL, REASONING_AGENT_NAME,
 * LMSTUDIO_BASE_URL, REASONING_MODEL
 */

import { describe, it, expect, beforeAll } from "vitest";

const CONTROL_PLANE = process.env.CONTROL_PLANE_URL ?? "http://localhost:3000";
const AGENT_NAME = process.env.REASONING_AGENT_NAME ?? "L";
const LMSTUDIO_BASE_URL =
  process.env.LMSTUDIO_BASE_URL ?? "http://169.254.83.107:1234";
const REASONING_MODEL = process.env.REASONING_MODEL ?? "qwen/qwen3-4b";

const PROMPT =
  "What is 17*23? Explain briefly, and make sure the final number appears in your answer.";
const EXPECTED_ANSWER = "391";

let agentDid: string;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ChatResult {
  /** Concatenated chunks tagged thinking:true */
  thinkingText: string;
  /** Concatenated chunks tagged thinking:false (the visible answer) */
  answerText: string;
  /** Chunks in arrival order, for interleaving assertions */
  chunks: Array<{ text: string; thinking: boolean }>;
  error?: string;
}

/**
 * POST /api/test/chat and consume the SSE response, splitting chunks by
 * their `thinking` tag — mirroring exactly what ChatTab.tsx does.
 */
async function chat(
  message: string,
  opts: { stream: boolean; thinking: boolean }
): Promise<ChatResult> {
  const res = await fetch(`${CONTROL_PLANE}/api/test/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: agentDid,
      messages: [{ role: "user", content: message }],
      stream: opts.stream,
      thinking: opts.thinking,
    }),
  });
  expect(res.ok, `POST /api/test/chat => ${res.status}`).toBe(true);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const result: ChatResult = { thinkingText: "", answerText: "", chunks: [] };

  let buffer = "";
  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") break outer;
      const parsed = JSON.parse(data) as {
        text?: string;
        thinking?: boolean;
        error?: string;
      };
      if (parsed.error) {
        result.error = parsed.error;
        break outer;
      }
      if (parsed.text) {
        const thinking = parsed.thinking === true;
        result.chunks.push({ text: parsed.text, thinking });
        if (thinking) result.thinkingText += parsed.text;
        else result.answerText += parsed.text;
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup — verify the live stack and point the agent at the reasoning model
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // LM Studio must serve the reasoning model
  const models = (await (
    await fetch(`${LMSTUDIO_BASE_URL}/v1/models`)
  ).json()) as { data: Array<{ id: string }> };
  expect(
    models.data.map((m) => m.id),
    `${REASONING_MODEL} must be available in LM Studio`
  ).toContain(REASONING_MODEL);

  // Control plane test API must be enabled and the agent connected
  const agentsRes = await fetch(`${CONTROL_PLANE}/api/test/agents`);
  expect(
    agentsRes.ok,
    "GET /api/test/agents failed — is ENABLE_TEST_API=true on the control plane?"
  ).toBe(true);
  const agents = (await agentsRes.json()) as Array<{
    id: string;
    name: string;
  }>;
  const agent = agents.find((a) => a.name === AGENT_NAME);
  expect(agent, `agent "${AGENT_NAME}" must be connected`).toBeDefined();
  agentDid = agent!.id;

  // Point the agent at the reasoning model
  const cfgRes = await fetch(
    `${CONTROL_PLANE}/api/test/agents/${encodeURIComponent(agentDid)}/llm-config`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai-compatible",
        model: REASONING_MODEL,
        baseUrl: LMSTUDIO_BASE_URL,
      }),
    }
  );
  expect(cfgRes.ok).toBe(true);
  // Give the agent a moment to apply the pushed config
  await new Promise((r) => setTimeout(r, 1500));
}, 60_000);

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("reasoning E2E — token-by-token streaming path", () => {
  it("thinking=true streams reasoning chunks tagged thinking:true, then a clean answer", async () => {
    const r = await chat(PROMPT, { stream: true, thinking: true });

    expect(r.error).toBeUndefined();
    // The model actually reasoned, and the reasoning reached the client
    expect(r.thinkingText.trim().length).toBeGreaterThan(20);
    // The visible answer is correct…
    expect(r.answerText).toContain(EXPECTED_ANSWER);
    // …and contains no leaked think markup
    expect(r.answerText).not.toContain("<think>");
    expect(r.answerText).not.toContain("</think>");
    expect(r.thinkingText).not.toContain("<think>");

    // Reasoning arrives before the answer (streamed, not post-hoc)
    const firstThinking = r.chunks.findIndex((c) => c.thinking);
    const lastAnswer = r.chunks.map((c) => c.thinking).lastIndexOf(false);
    expect(firstThinking).toBeGreaterThanOrEqual(0);
    expect(firstThinking).toBeLessThan(lastAnswer);

    // Genuinely streamed: reasoning split across many chunks
    expect(r.chunks.filter((c) => c.thinking).length).toBeGreaterThan(5);
  });

  it("thinking=false yields an answer without reasoning content", async () => {
    const r = await chat(PROMPT, { stream: true, thinking: false });

    expect(r.error).toBeUndefined();
    expect(r.answerText).toContain(EXPECTED_ANSWER);
    expect(r.answerText).not.toContain("<think>");
    // Qwen3 with the /no_think soft switch may emit an empty think block;
    // whitespace is tolerated, real reasoning is not.
    expect(r.thinkingText.trim()).toBe("");
  });
});

describe("reasoning E2E — buffered path (stream=false)", () => {
  it("thinking=true returns the reasoning tagged thinking:true and a clean answer", async () => {
    const r = await chat(PROMPT, { stream: false, thinking: true });

    expect(r.error).toBeUndefined();
    expect(r.thinkingText.trim().length).toBeGreaterThan(20);
    expect(r.answerText).toContain(EXPECTED_ANSWER);
    expect(r.answerText).not.toContain("<think>");
    expect(r.answerText).not.toContain("</think>");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Real UI route — the exact endpoint + body shape the ChatTab "Thinking"
// button sends. Requires an API key allowed on
// "POST /api/agents/[did]/chat-sessions" (set VC_E2E_API_KEY).
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = process.env.VC_E2E_API_KEY;

interface RealRouteResult {
  sessionId?: string;
  thinkingText: string;
  answerText: string;
}

/**
 * POST /api/agents/:did/chat-sessions exactly as ChatTab.tsx does, consuming
 * the SSE stream (session event + thinking/answer chunks).
 */
async function chatViaRealRoute(
  message: string,
  opts: { stream: boolean; thinking: boolean }
): Promise<RealRouteResult> {
  const res = await fetch(
    `${CONTROL_PLANE}/api/agents/${encodeURIComponent(agentDid)}/chat-sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY!,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }],
        stream: opts.stream,
        thinking: opts.thinking,
      }),
    }
  );
  expect(res.ok, `chat-sessions => ${res.status}`).toBe(true);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const result: RealRouteResult = { thinkingText: "", answerText: "" };
  let buffer = "";
  let eventType = "message";
  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: ")) {
        if (line === "") eventType = "message";
        continue;
      }
      const data = line.slice(6);
      if (data === "[DONE]") break outer;
      const parsed = JSON.parse(data);
      if (eventType === "session") {
        result.sessionId = parsed.conversationId;
        eventType = "message";
        continue;
      }
      expect(parsed.error).toBeUndefined();
      if (parsed.text) {
        if (parsed.thinking) result.thinkingText += parsed.text;
        else result.answerText += parsed.text;
      }
      eventType = "message";
    }
  }
  return result;
}

describe.skipIf(!API_KEY)(
  "reasoning E2E — real chat-sessions route (ChatTab button path)",
  () => {
    it("POST /api/agents/:did/chat-sessions with thinking:true streams tagged reasoning", async () => {
      const r = await chatViaRealRoute(PROMPT, {
        stream: true,
        thinking: true,
      });

      expect(
        r.sessionId,
        "session event must announce a conversationId"
      ).toBeTruthy();
      expect(r.thinkingText.trim().length).toBeGreaterThan(20);
      expect(r.answerText).toContain(EXPECTED_ANSWER);
      expect(r.answerText).not.toContain("<think>");
      expect(r.answerText).not.toContain("</think>");
    });

    it("persists the reasoning in the session history (GET returns it)", async () => {
      const r = await chatViaRealRoute(PROMPT, {
        stream: true,
        thinking: true,
      });
      expect(r.sessionId).toBeTruthy();
      expect(r.thinkingText.trim().length).toBeGreaterThan(20);

      // Give the agent a beat to persist the assistant row after [DONE]
      await new Promise((res) => setTimeout(res, 1000));

      const histRes = await fetch(
        `${CONTROL_PLANE}/api/agents/${encodeURIComponent(agentDid)}/chat-sessions/${encodeURIComponent(r.sessionId!)}`,
        { headers: { "x-api-key": API_KEY! } }
      );
      expect(histRes.ok, `GET session messages => ${histRes.status}`).toBe(
        true
      );
      const { messages } = (await histRes.json()) as {
        messages: Array<{ role: string; content: string; thinking?: string }>;
      };

      const assistant = messages.find((m) => m.role === "assistant");
      expect(assistant, "history must contain an assistant message").toBeTruthy();
      // Reasoning was persisted alongside the answer…
      expect(assistant!.thinking, "assistant.thinking must be persisted").toBeTruthy();
      expect(assistant!.thinking!.trim().length).toBeGreaterThan(20);
      // …and the stored answer stays clean of think markup.
      expect(assistant!.content).toContain(EXPECTED_ANSWER);
      expect(assistant!.content).not.toContain("<think>");
    });
  }
);
