/**
 * Fast, config-free regression test for the reasoning/thinking pipeline.
 *
 * `reasoning-e2e.test.ts` exercises the same pipeline against a LIVE dev
 * stack (control plane + WS + a running agent + a real LM Studio instance)
 * and is excluded from the default `pnpm test` run because of that. This
 * file covers the same regression risk — LM-Studio-style `reasoning_content`
 * SSE deltas surviving the trip through the real Mastra Agent + AI SDK down
 * to thinking/answer-tagged chunks — with a mocked OpenAI-compatible API, so
 * it runs in CI and locally with zero setup.
 *
 * Only `fetch` is mocked. `llm.ts` (buildModel/streamChat/inlineReasoningContent)
 * and `agent.ts`'s `splitThinkContent` run for real, exercising the actual
 * production code path:
 *   mocked LM Studio SSE (reasoning_content deltas)
 *     -> custom fetch wrapper (llm.ts) -> inlineReasoningContent (<think> inlining)
 *     -> real AI SDK openai-compatible provider -> real Mastra Agent.stream()
 *     -> chunkStream (llm.ts)
 *     -> splitThinkContent (agent.ts) — mirrors what the WS chat handler does
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { streamChat } from "../packages/agent-controller/src/llm";
import { splitThinkContent } from "../packages/agent-controller/src/agent";

// ---------------------------------------------------------------------------
// A minimal LM-Studio-style OpenAI-compatible SSE fixture builder
// ---------------------------------------------------------------------------

function sseChunk(delta: Record<string, unknown>, finish: string | null = null) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-fake",
    object: "chat.completion.chunk",
    created: 0,
    model: "qwen/qwen3-4b",
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

/** Builds a streaming Response mimicking LM Studio's reasoning_content + content deltas. */
function fakeLmStudioResponse(): Response {
  const lines = [
    sseChunk({ role: "assistant", reasoning_content: "17*23 " }),
    sseChunk({ reasoning_content: "= 391." }),
    sseChunk({ content: "The answer" }),
    sseChunk({ content: " is 391." }, "stop"),
    "data: [DONE]\n\n",
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Drains a chunkStream into its raw (unsplit) text, in arrival order. */
async function drainChunkStream(
  chunkStream: AsyncIterable<{ text: string; thinking: boolean }>
): Promise<{ text: string; thinking: boolean }[]> {
  const out: { text: string; thinking: boolean }[] = [];
  for await (const chunk of chunkStream) out.push(chunk);
  return out;
}

describe("reasoning pipeline — mocked openai-compatible API (no live stack required)", () => {
  const capturedRequests: Array<{ url: string; body: any }> = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    capturedRequests.length = 0;
  });

  it("inlines reasoning_content into <think> tags that splitThinkContent recovers as thinking/answer segments", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      capturedRequests.push({ url, body: JSON.parse(init.body as string) });
      return fakeLmStudioResponse();
    });

    const { chunkStream } = streamChat(
      {
        provider: "openai-compatible",
        model: "qwen/qwen3-4b",
        baseUrl: "http://fake-lmstudio.local:1234",
      } as any,
      [{ role: "user", content: "What is 17*23?" }],
      undefined,
      undefined,
      undefined,
      undefined,
      { thinking: true }
    );

    const chunks = await drainChunkStream(chunkStream);
    expect(chunks.length).toBeGreaterThan(0);

    // openai-compatible reasoning arrives as plain text-delta chunks (with
    // inline <think> tags) — chunkStream itself does not classify it as
    // "thinking", that's splitThinkContent's job downstream.
    expect(chunks.every((c) => c.thinking === false)).toBe(true);

    let thinkBuf = "";
    let inThinking = false;
    const segments: Array<{ text: string; thinking: boolean }> = [];
    for (const c of chunks) {
      const split = splitThinkContent(thinkBuf + c.text, inThinking);
      thinkBuf = split.remaining;
      inThinking = split.inThinking;
      segments.push(...split.segments);
    }
    if (thinkBuf) segments.push({ text: thinkBuf, thinking: inThinking });

    const thinkingText = segments
      .filter((s) => s.thinking)
      .map((s) => s.text)
      .join("");
    const answerText = segments
      .filter((s) => !s.thinking)
      .map((s) => s.text)
      .join("");

    expect(thinkingText).toBe("17*23 = 391.");
    expect(answerText).toBe("The answer is 391.");
    expect(answerText).not.toContain("<think>");
    expect(answerText).not.toContain("</think>");
    expect(thinkingText).not.toContain("<think>");

    // Reasoning arrives before the answer, matching the streamed UX.
    const firstThinking = segments.findIndex((s) => s.thinking);
    const lastAnswer = segments.map((s) => s.thinking).lastIndexOf(false);
    expect(firstThinking).toBeGreaterThanOrEqual(0);
    expect(firstThinking).toBeLessThan(lastAnswer);
  });

  it("appends the /no_think directive to the last user message for qwen3 models when thinking is not requested", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      capturedRequests.push({ url, body: JSON.parse(init.body as string) });
      // No reasoning_content in the reply — the model was told not to think.
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          const enc = new TextEncoder();
          c.enqueue(enc.encode(sseChunk({ role: "assistant", content: "391" }, "stop")));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const { chunkStream } = streamChat(
      {
        provider: "openai-compatible",
        model: "qwen/qwen3-4b",
        baseUrl: "http://fake-lmstudio.local:1234",
      } as any,
      [{ role: "user", content: "What is 17*23?" }],
      undefined,
      undefined,
      undefined,
      undefined,
      { thinking: false }
    );

    await drainChunkStream(chunkStream);

    expect(capturedRequests.length).toBeGreaterThan(0);
    const lastUserMessage = capturedRequests[0].body.messages
      .filter((m: any) => m.role === "user")
      .pop();
    expect(lastUserMessage.content).toContain("/no_think");
  });

  it("passes plain (non-reasoning) responses through unchanged", async () => {
    vi.stubGlobal("fetch", async () => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          const enc = new TextEncoder();
          c.enqueue(enc.encode(sseChunk({ role: "assistant", content: "Hello" })));
          c.enqueue(enc.encode(sseChunk({ content: " world" }, "stop")));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const { chunkStream } = streamChat(
      {
        provider: "openai-compatible",
        model: "local-llama",
        baseUrl: "http://fake-lmstudio.local:1234",
      } as any,
      [{ role: "user", content: "hi" }]
    );

    const chunks = await drainChunkStream(chunkStream);
    const text = chunks.map((c) => c.text).join("");
    expect(text).toBe("Hello world");
    expect(text).not.toContain("<think>");
  });
});
