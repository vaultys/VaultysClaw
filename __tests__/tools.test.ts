/**
 * Tests for the agent-controller tool system:
 *   - Tool registry creation and filtering
 *   - Built-in tool execution (shell, HTTP, file ops, code runner)
 *   - Approval gate mechanism
 *   - Tool integration with LLM (buildToolSet)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs/promises";
import os from "os";

import {
  createToolRegistry,
  buildToolSet,
  type ToolRegistry,
} from "../packages/agent-controller/src/tools";

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

describe("Tool Registry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry({ workspaceRoot: os.tmpdir() });
  });

  it("should create a registry with built-in tools", () => {
    expect(registry.tools.length).toBeGreaterThanOrEqual(5); // shell, http, file_read, file_write, file_list, code_run
  });

  it("should look up a tool by name", () => {
    const shell = registry.get("shell");
    expect(shell).toBeDefined();
    expect(shell!.capability).toBe("system_command");
    expect(shell!.requiresApproval).toBe(true);
  });

  it("should filter tools by capabilities", () => {
    const fileTools = registry.forCapabilities(["file_access"]);
    expect(fileTools.length).toBe(3); // file_read, file_write, file_list

    const allNames = fileTools.map((t) => t.name);
    expect(allNames).toContain("file_read");
    expect(allNames).toContain("file_write");
    expect(allNames).toContain("file_list");
  });

  it("should return empty array for no matching capabilities", () => {
    const tools = registry.forCapabilities(["mail_send"]);
    expect(tools).toEqual([]);
  });

  it("should include extra tools when provided", () => {
    const { tool } = require("ai");
    const { z } = require("zod");
    const custom = createToolRegistry({
      extraTools: [
        {
          name: "custom_tool",
          capability: "api_call" as const,
          requiresApproval: false,
          tool: tool({
            description: "A test tool",
            inputSchema: z.object({ input: z.string() }),
            execute: async () => ({ result: "ok" }),
          }),
        },
      ],
    });

    expect(custom.get("custom_tool")).toBeDefined();
    expect(custom.forCapabilities(["api_call"]).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// buildToolSet
// ---------------------------------------------------------------------------

describe("buildToolSet", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry({ workspaceRoot: os.tmpdir() });
  });

  it("should return an AI SDK ToolSet with only granted capabilities", () => {
    const toolSet = buildToolSet(registry, ["system_command"]);
    expect(Object.keys(toolSet)).toContain("shell");
    expect(Object.keys(toolSet)).not.toContain("file_read");
    expect(Object.keys(toolSet)).not.toContain("http_request");
  });

  it("should return empty ToolSet when no capabilities match", () => {
    const toolSet = buildToolSet(registry, []);
    expect(Object.keys(toolSet)).toHaveLength(0);
  });

  it("should wrap approved tools with an approval gate", async () => {
    const approvalFn = vi.fn().mockResolvedValue(true);
    const toolSet = buildToolSet(registry, ["code_execution"], approvalFn);

    expect(Object.keys(toolSet)).toContain("code_run");

    // Execute the code_run tool — it should call the approval callback first
    const result = await (toolSet.code_run as any).execute({ code: "1 + 1", timeoutMs: 5000 }, {});
    expect(approvalFn).toHaveBeenCalledOnce();
    expect(approvalFn).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "code_run",
        args: { code: "1 + 1", timeoutMs: 5000 },
      }),
    );
    expect(result.result).toBe("2");
  });

  it("should return rejection when approval is denied", async () => {
    const approvalFn = vi.fn().mockResolvedValue(false);
    const toolSet = buildToolSet(registry, ["system_command"], approvalFn);

    const result = await (toolSet.shell as any).execute(
      { command: "echo", args: ["hello"], timeoutMs: 5000 },
      {},
    );
    expect(result.error).toContain("rejected");
    expect(result.approved).toBe(false);
  });

  it("should not require approval for read-only tools", async () => {
    const approvalFn = vi.fn().mockResolvedValue(true);
    const toolSet = buildToolSet(registry, ["file_access"], approvalFn);

    // file_read and file_list should NOT call the approval callback
    expect(registry.get("file_read")!.requiresApproval).toBe(false);
    expect(registry.get("file_list")!.requiresApproval).toBe(false);

    // file_write SHOULD call the approval callback
    expect(registry.get("file_write")!.requiresApproval).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shell tool
// ---------------------------------------------------------------------------

describe("Shell tool", () => {
  it("should execute a simple command", async () => {
    const { shellTool } = await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "echo", args: ["hello world"], timeoutMs: 5000 },
      {} as any,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");
  });

  it("should capture stderr", async () => {
    const { shellTool } = await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "ls", args: ["/nonexistent-path-xyz"], timeoutMs: 5000 },
      {} as any,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("should timeout long-running commands", async () => {
    const { shellTool } = await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "sleep", args: ["10"], timeoutMs: 500 },
      {} as any,
    );
    // Should have been killed
    expect(result.exitCode).not.toBe(0);
  }, 5000);
});

// ---------------------------------------------------------------------------
// HTTP request tool
// ---------------------------------------------------------------------------

describe("HTTP request tool", () => {
  it("should make a GET request", async () => {
    const { httpRequestTool } = await import("../packages/agent-controller/src/tools/http-request");

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
    );

    try {
      const result = await httpRequestTool.tool.execute!(
        { url: "https://httpbin.org/get", method: "GET", headers: {}, timeoutMs: 5000 },
        {} as any,
      );
      expect(result.status).toBe(200);
      expect(result.body).toContain("ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle timeout", async () => {
    const { httpRequestTool } = await import("../packages/agent-controller/src/tools/http-request");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() =>
      new Promise((_, reject) => {
        const err = new Error("aborted");
        err.name = "AbortError";
        setTimeout(() => reject(err), 100);
      }),
    );

    try {
      const result = await httpRequestTool.tool.execute!(
        { url: "https://example.com/slow", method: "GET", headers: {}, timeoutMs: 50 },
        {} as any,
      );
      expect(result.status).toBe(0);
      expect(result.body).toContain("timed out");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// File operations tools
// ---------------------------------------------------------------------------

describe("File ops tools", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vaultysclaw-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should write and read a file", async () => {
    const { createFileTools } = await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const writeTool = tools.find((t) => t.name === "file_write")!;
    const readTool = tools.find((t) => t.name === "file_read")!;

    await writeTool.tool.execute!(
      { path: "test.txt", content: "hello from tool" },
      {} as any,
    );

    const readResult = await readTool.tool.execute!(
      { path: "test.txt" },
      {} as any,
    );
    expect(readResult.content).toBe("hello from tool");
    expect(readResult.truncated).toBe(false);
  });

  it("should list directory contents", async () => {
    const { createFileTools } = await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const writeTool = tools.find((t) => t.name === "file_write")!;
    const listTool = tools.find((t) => t.name === "file_list")!;

    await writeTool.tool.execute!(
      { path: "a.txt", content: "aaa" },
      {} as any,
    );
    await writeTool.tool.execute!(
      { path: "b.txt", content: "bbb" },
      {} as any,
    );

    const result = await listTool.tool.execute!({ path: "." }, {} as any);
    const names = result.entries.map((e: any) => e.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("b.txt");
  });

  it("should reject path traversal", async () => {
    const { createFileTools } = await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const readTool = tools.find((t) => t.name === "file_read")!;

    await expect(
      readTool.tool.execute!({ path: "../../etc/passwd" }, {} as any),
    ).rejects.toThrow("Path traversal denied");
  });

  it("should create parent directories when writing", async () => {
    const { createFileTools } = await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const writeTool = tools.find((t) => t.name === "file_write")!;

    await writeTool.tool.execute!(
      { path: "deep/nested/dir/file.txt", content: "deep content" },
      {} as any,
    );

    const content = await fs.readFile(path.join(tmpDir, "deep/nested/dir/file.txt"), "utf-8");
    expect(content).toBe("deep content");
  });
});

// ---------------------------------------------------------------------------
// Code runner tool
// ---------------------------------------------------------------------------

describe("Code runner tool", () => {
  it("should execute JavaScript and return the result", async () => {
    const { codeRunnerTool } = await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "2 + 2", timeoutMs: 5000 },
      {} as any,
    );
    expect(result.result).toBe("4");
  });

  it("should capture console.log output", async () => {
    const { codeRunnerTool } = await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "console.log('hello'); console.log('world'); 42", timeoutMs: 5000 },
      {} as any,
    );
    expect(result.output).toBe("hello\nworld");
    expect(result.result).toBe("42");
  });

  it("should not allow access to require", async () => {
    const { codeRunnerTool } = await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "require('fs')", timeoutMs: 5000 },
      {} as any,
    );
    expect(result.error).toBeDefined();
  });

  it("should not allow access to process", async () => {
    const { codeRunnerTool } = await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "process.env", timeoutMs: 5000 },
      {} as any,
    );
    expect(result.error).toBeDefined();
  });

  it("should timeout infinite loops", async () => {
    const { codeRunnerTool } = await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "while(true){}", timeoutMs: 500 },
      {} as any,
    );
    expect(result.error).toBeDefined();
    expect(result.error).toContain("timed out");
  }, 5000);

  it("should handle complex expressions", async () => {
    const { codeRunnerTool } = await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      {
        code: `
          const data = [1, 2, 3, 4, 5];
          const sum = data.reduce((a, b) => a + b, 0);
          const avg = sum / data.length;
          JSON.stringify({ sum, avg });
        `,
        timeoutMs: 5000,
      },
      {} as any,
    );
    const parsed = JSON.parse(result.result);
    expect(parsed.sum).toBe(15);
    expect(parsed.avg).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Tool approval integration (via WebSocket)
// ---------------------------------------------------------------------------

describe("Tool approval integration", () => {
  it("should have getPendingToolApprovals method on WS server", async () => {
    // Verify the WS server module exports the needed types
    const { AgentWSServer } = await import("../packages/control-plane/lib/ws-server");
    expect(typeof AgentWSServer.prototype.getPendingToolApprovals).toBe("function");
    expect(typeof AgentWSServer.prototype.respondToToolApproval).toBe("function");
  });
});
