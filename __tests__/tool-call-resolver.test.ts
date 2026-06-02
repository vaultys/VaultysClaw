/**
 * Unit tests for tool-call-resolver.ts
 *
 * These tests cover all three fallback strategies without requiring an LLM.
 * Fast, deterministic, runs in Node.js via Vitest.
 */

import { describe, it, expect, vi } from "vitest";
import {
  parseTextToolCall,
  executeToolCall,
  resolveToolResults,
} from "../packages/agent-controller/src/tool-call-resolver";
import type { ToolSet } from "ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string, returnValue: unknown) {
  return {
    description: `Mock ${name} tool`,
    parameters: {},
    execute: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeToolSet(
  tools: Record<string, ReturnType<typeof makeTool>>
): ToolSet {
  return tools as unknown as ToolSet;
}

// ---------------------------------------------------------------------------
// parseTextToolCall
// ---------------------------------------------------------------------------

describe("parseTextToolCall", () => {
  const toolNames = new Set(["file_list", "file_read", "shell"]);

  it("parses {name, parameters} format", () => {
    const text = JSON.stringify({
      name: "file_list",
      parameters: { path: "/tmp" },
    });
    const result = parseTextToolCall(text, toolNames);
    expect(result).toEqual({ toolName: "file_list", args: { path: "/tmp" } });
  });

  it("parses {tool, arguments} format", () => {
    const text = JSON.stringify({
      tool: "file_read",
      arguments: { path: "hello.txt" },
    });
    const result = parseTextToolCall(text, toolNames);
    expect(result).toEqual({
      toolName: "file_read",
      args: { path: "hello.txt" },
    });
  });

  it("parses {function, args} format", () => {
    const text = JSON.stringify({ function: "shell", args: { command: "ls" } });
    const result = parseTextToolCall(text, toolNames);
    expect(result).toEqual({ toolName: "shell", args: { command: "ls" } });
  });

  it("parses tool call wrapped in markdown code block", () => {
    const text =
      'Here is the tool call:\n```json\n{"name":"file_list","parameters":{"path":"."} }\n```';
    const result = parseTextToolCall(text, toolNames);
    expect(result).toEqual({ toolName: "file_list", args: { path: "." } });
  });

  it("defaults args to {} when no args key present", () => {
    const text = JSON.stringify({ name: "file_list" });
    const result = parseTextToolCall(text, toolNames);
    expect(result).toEqual({ toolName: "file_list", args: {} });
  });

  it("returns null for unknown tool name", () => {
    const text = JSON.stringify({ name: "unknown_tool", parameters: {} });
    expect(parseTextToolCall(text, toolNames)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseTextToolCall("not json at all", toolNames)).toBeNull();
  });

  it("returns null for JSON with no name/tool/function field", () => {
    const text = JSON.stringify({ action: "file_list", params: {} });
    expect(parseTextToolCall(text, toolNames)).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(parseTextToolCall("", toolNames)).toBeNull();
    expect(parseTextToolCall("   ", toolNames)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// executeToolCall
// ---------------------------------------------------------------------------

describe("executeToolCall", () => {
  it("executes a known tool and returns result", async () => {
    const tools = makeToolSet({
      file_list: makeTool("file_list", {
        entries: [{ name: "hello.txt", type: "file" }],
      }),
    });
    const result = await executeToolCall("file_list", { path: "." }, tools);
    expect(result.tool).toBe("file_list");
    expect(result.result).toEqual({
      entries: [{ name: "hello.txt", type: "file" }],
    });
  });

  it("passes args to the tool's execute function", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ content: "hello" });
    const tools = makeToolSet({
      file_read: {
        description: "read",
        parameters: {},
        execute: mockExecute,
      } as any,
    });
    await executeToolCall("file_read", { path: "test.txt" }, tools);
    expect(mockExecute).toHaveBeenCalledWith(
      { path: "test.txt" },
      expect.objectContaining({ toolCallId: expect.any(String) })
    );
  });

  it("returns error result for unknown tool", async () => {
    const tools = makeToolSet({});
    const result = await executeToolCall("unknown", {}, tools);
    expect(result.tool).toBe("unknown");
    expect((result.result as any).error).toMatch(/Unknown tool/);
  });

  it("returns error result when tool throws", async () => {
    const tools = makeToolSet({
      bad_tool: {
        description: "bad",
        parameters: {},
        execute: vi.fn().mockRejectedValue(new Error("permission denied")),
      } as any,
    });
    const result = await executeToolCall("bad_tool", {}, tools);
    expect(result.tool).toBe("bad_tool");
    expect((result.result as any).error).toContain("permission denied");
  });
});

// ---------------------------------------------------------------------------
// resolveToolResults
// ---------------------------------------------------------------------------

describe("resolveToolResults", () => {
  it("Case 1: collects existing tool results from steps", async () => {
    const tools = makeToolSet({});
    const output = {
      text: "",
      steps: [
        {
          toolResults: [
            {
              toolName: "file_list",
              output: { entries: [{ name: "a.txt", type: "file" }] },
            },
          ],
        },
      ],
    };
    const result = await resolveToolResults(output, tools);
    const parsed = JSON.parse(result);
    expect(parsed[0].tool).toBe("file_list");
    expect(parsed[0].result).toEqual({
      entries: [{ name: "a.txt", type: "file" }],
    });
  });

  it("Case 1: uses result field when output is absent", async () => {
    const tools = makeToolSet({});
    const output = {
      text: "",
      steps: [
        {
          toolResults: [
            { toolName: "shell", result: { exitCode: 0, stdout: "hello" } },
          ],
        },
      ],
    };
    const result = JSON.parse(await resolveToolResults(output, tools));
    expect(result[0].result).toEqual({ exitCode: 0, stdout: "hello" });
  });

  it("Case 2: executes tool manually when tool call has no results", async () => {
    const mockExecute = vi
      .fn()
      .mockResolvedValue({ entries: [{ name: "b.txt", type: "file" }] });
    const tools = makeToolSet({
      file_list: {
        description: "list",
        parameters: {},
        execute: mockExecute,
      } as any,
    });
    const output = {
      text: "",
      steps: [{ toolCalls: [{ toolName: "file_list", args: undefined }] }],
    };
    const result = JSON.parse(await resolveToolResults(output, tools));
    expect(mockExecute).toHaveBeenCalledWith({}, expect.anything());
    expect(result[0].tool).toBe("file_list");
    expect(result[0].result).toEqual({
      entries: [{ name: "b.txt", type: "file" }],
    });
  });

  it("Case 2: passes available args when present", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ entries: [] });
    const tools = makeToolSet({
      file_list: {
        description: "list",
        parameters: {},
        execute: mockExecute,
      } as any,
    });
    const output = {
      text: "",
      steps: [
        { toolCalls: [{ toolName: "file_list", args: { path: "/tmp" } }] },
      ],
    };
    await resolveToolResults(output, tools);
    expect(mockExecute).toHaveBeenCalledWith(
      { path: "/tmp" },
      expect.anything()
    );
  });

  it("Case 3: executes tool call from text when no steps", async () => {
    const mockExecute = vi
      .fn()
      .mockResolvedValue({ entries: [{ name: "c.txt", type: "file" }] });
    const tools = makeToolSet({
      file_list: {
        description: "list",
        parameters: {},
        execute: mockExecute,
      } as any,
    });
    const output = {
      text: JSON.stringify({ name: "file_list", parameters: { path: "." } }),
      steps: [],
    };
    const result = JSON.parse(await resolveToolResults(output, tools));
    expect(result[0].tool).toBe("file_list");
    expect(result[0].result).toEqual({
      entries: [{ name: "c.txt", type: "file" }],
    });
  });

  it("returns empty string when nothing resolves", async () => {
    const tools = makeToolSet({});
    const output = { text: "Just a plain response with no tools", steps: [] };
    const result = await resolveToolResults(output, tools);
    expect(result).toBe("");
  });

  it("returns empty string for empty output with no steps", async () => {
    const tools = makeToolSet({ file_list: makeTool("file_list", {}) });
    const output = { text: "", steps: [] };
    expect(await resolveToolResults(output, tools)).toBe("");
  });

  it("Case 1 takes priority over Case 2 when both present", async () => {
    const mockExecute = vi.fn();
    const tools = makeToolSet({
      file_list: {
        description: "list",
        parameters: {},
        execute: mockExecute,
      } as any,
    });
    const output = {
      text: "",
      steps: [
        {
          toolCalls: [{ toolName: "file_list", args: {} }],
          toolResults: [
            {
              toolName: "file_list",
              result: { entries: [{ name: "existing.txt", type: "file" }] },
            },
          ],
        },
      ],
    };
    const result = JSON.parse(await resolveToolResults(output, tools));
    // Should use existing results, not call execute again
    expect(mockExecute).not.toHaveBeenCalled();
    expect(result[0].result.entries[0].name).toBe("existing.txt");
  });
});
