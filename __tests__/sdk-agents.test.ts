/**
 * Unit tests for the experimental Mastra SDK Agents integration in llm.ts:
 * claude-agent-sdk / cursor-agent-sdk / openai-agent-sdk providers wrap a
 * vendor's own agent harness (ClaudeSDKAgent/CursorSDKAgent/OpenAISDKAgent)
 * instead of a plain chat model. The vendor packages are mocked — these
 * tests only verify VaultysClaw's own wiring (which class gets constructed,
 * with which options, and that generate()/stream() get called), not the
 * vendor SDKs themselves.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  claudeCtor,
  claudeGenerate,
  claudeStream,
  cursorCtor,
  cursorGenerate,
  openaiCtor,
  openaiGenerate,
  setDefaultOpenAIKeyMock,
} = vi.hoisted(() => ({
  claudeCtor: vi.fn(),
  claudeGenerate: vi.fn().mockResolvedValue({
    text: "claude reply",
    usage: { promptTokens: 10, completionTokens: 5 },
    steps: [],
    finishReason: "stop",
  }),
  claudeStream: vi.fn(),
  cursorCtor: vi.fn(),
  cursorGenerate: vi.fn().mockResolvedValue({
    text: "cursor reply",
    usage: { promptTokens: 7, completionTokens: 3 },
    steps: [],
    finishReason: "stop",
  }),
  openaiCtor: vi.fn(),
  openaiGenerate: vi.fn().mockResolvedValue({
    text: "openai agent reply",
    usage: { promptTokens: 4, completionTokens: 2 },
    steps: [],
    finishReason: "stop",
  }),
  setDefaultOpenAIKeyMock: vi.fn(),
}));

vi.mock("@mastra/claude", () => ({
  ClaudeSDKAgent: vi.fn().mockImplementation(function (this: any, opts: any) {
    claudeCtor(opts);
    this.generate = claudeGenerate;
    this.stream = claudeStream;
  }),
}));

vi.mock("@mastra/cursor", () => ({
  CursorSDKAgent: vi.fn().mockImplementation(function (this: any, opts: any) {
    cursorCtor(opts);
    this.generate = cursorGenerate;
  }),
}));

vi.mock("@mastra/openai", () => ({
  OpenAISDKAgent: vi.fn().mockImplementation(function (this: any, opts: any) {
    openaiCtor(opts);
    this.generate = openaiGenerate;
  }),
}));

vi.mock("@openai/agents", () => ({
  setDefaultOpenAIKey: setDefaultOpenAIKeyMock,
}));

import {
  buildModel,
  isSdkAgentProvider,
  runIntent,
} from "../packages/agent-controller/src/llm";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isSdkAgentProvider", () => {
  it("recognizes the three experimental SDK-agent providers", () => {
    expect(isSdkAgentProvider("claude-agent-sdk")).toBe(true);
    expect(isSdkAgentProvider("cursor-agent-sdk")).toBe(true);
    expect(isSdkAgentProvider("openai-agent-sdk")).toBe(true);
  });

  it("returns false for regular chat-model providers", () => {
    expect(isSdkAgentProvider("openai")).toBe(false);
    expect(isSdkAgentProvider("anthropic")).toBe(false);
    expect(isSdkAgentProvider("google")).toBe(false);
    expect(isSdkAgentProvider("ollama")).toBe(false);
    expect(isSdkAgentProvider("openai-compatible")).toBe(false);
  });
});

describe("buildModel — SDK-agent providers", () => {
  it("throws a clear error instead of building a chat model", () => {
    for (const provider of [
      "claude-agent-sdk",
      "cursor-agent-sdk",
      "openai-agent-sdk",
    ] as const) {
      expect(() => buildModel({ provider, model: "x" } as any)).toThrow(
        /does not support SDK-agent provider/
      );
    }
  });
});

describe("runIntent — claude-agent-sdk", () => {
  it("constructs a ClaudeSDKAgent with model/cwd/allowedTools and an ANTHROPIC_API_KEY env override", async () => {
    const result = await runIntent(
      {
        provider: "claude-agent-sdk",
        model: "claude-sonnet-4-5",
        apiKey: "sk-ant-test",
        cwd: "/workspace",
        allowedTools: ["Read", "Bash"],
      } as any,
      "do something",
      {}
    );

    expect(result.text).toBe("claude reply");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(claudeCtor).toHaveBeenCalledOnce();
    const opts = claudeCtor.mock.calls[0][0];
    expect(opts.sdkOptions.model).toBe("claude-sonnet-4-5");
    expect(opts.sdkOptions.cwd).toBe("/workspace");
    expect(opts.sdkOptions.allowedTools).toEqual(["Read", "Bash"]);
    expect(opts.sdkOptions.env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(claudeGenerate).toHaveBeenCalledOnce();
  });

  it("omits env when no apiKey is configured", async () => {
    await runIntent(
      { provider: "claude-agent-sdk", model: "claude-sonnet-4-5" } as any,
      "ping",
      {}
    );
    const opts = claudeCtor.mock.calls[0][0];
    expect(opts.sdkOptions.env).toBeUndefined();
  });

  it("ignores the internal tool registry (the harness manages its own tools)", async () => {
    await runIntent(
      { provider: "claude-agent-sdk", model: "claude-sonnet-4-5" } as any,
      "ping",
      {},
      { someTool: {} as any }
    );
    const opts = claudeCtor.mock.calls[0][0];
    expect(opts.tools).toBeUndefined();
  });
});

describe("runIntent — cursor-agent-sdk", () => {
  it("constructs a CursorSDKAgent with a wrapped model selection and apiKey", async () => {
    const result = await runIntent(
      { provider: "cursor-agent-sdk", model: "auto", apiKey: "cursor-key" } as any,
      "ping",
      {}
    );
    expect(result.text).toBe("cursor reply");
    expect(cursorCtor).toHaveBeenCalledOnce();
    const opts = cursorCtor.mock.calls[0][0];
    expect(opts.sdkOptions.model).toEqual({ id: "auto" });
    expect(opts.sdkOptions.apiKey).toBe("cursor-key");
  });
});

describe("runIntent — openai-agent-sdk", () => {
  it("sets the default OpenAI key and constructs an OpenAISDKAgent with instructions/model", async () => {
    const result = await runIntent(
      {
        provider: "openai-agent-sdk",
        model: "gpt-5.4-mini",
        apiKey: "sk-oai-test",
        systemPrompt: "Be concise.",
      } as any,
      "ping",
      {}
    );
    expect(result.text).toBe("openai agent reply");
    expect(setDefaultOpenAIKeyMock).toHaveBeenCalledWith("sk-oai-test");
    expect(openaiCtor).toHaveBeenCalledOnce();
    const opts = openaiCtor.mock.calls[0][0];
    expect(opts.sdkOptions.model).toBe("gpt-5.4-mini");
    expect(opts.sdkOptions.instructions).toBe("Be concise.");
  });

  it("does not call setDefaultOpenAIKey when no apiKey is configured", async () => {
    await runIntent(
      { provider: "openai-agent-sdk", model: "gpt-5.4-mini" } as any,
      "ping",
      {}
    );
    expect(setDefaultOpenAIKeyMock).not.toHaveBeenCalled();
  });
});
