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
    expect(custom.forCapabilities(["api_call"]).length).toBeGreaterThanOrEqual(
      2
    );
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
    const result = await (toolSet.code_run as any).execute(
      { code: "1 + 1", timeoutMs: 5000 },
      {}
    );
    expect(approvalFn).toHaveBeenCalledOnce();
    expect(approvalFn).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "code_run",
        args: { code: "1 + 1", timeoutMs: 5000 },
      })
    );
    expect(result.result).toBe("2");
  });

  it("should return rejection when approval is denied", async () => {
    const approvalFn = vi.fn().mockResolvedValue(false);
    const toolSet = buildToolSet(registry, ["system_command"], approvalFn);

    const result = await (toolSet.shell as any).execute(
      { command: "echo", args: ["hello"], timeoutMs: 5000 },
      {}
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
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "echo", args: ["hello world"], timeoutMs: 5000 },
      {} as any
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");
  });

  it("should capture stderr", async () => {
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "ls", args: ["/nonexistent-path-xyz"], timeoutMs: 5000 },
      {} as any
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("should timeout long-running commands", async () => {
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "sleep", args: ["10"], timeoutMs: 500 },
      {} as any
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
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");

    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      })
    );

    try {
      const result = await httpRequestTool.tool.execute!(
        {
          url: "https://httpbin.org/get",
          method: "GET",
          headers: {},
          timeoutMs: 5000,
        },
        {} as any
      );
      expect(result.status).toBe(200);
      expect(result.body).toContain("ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle timeout", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error("aborted");
          err.name = "AbortError";
          setTimeout(() => reject(err), 100);
        })
    );

    try {
      const result = await httpRequestTool.tool.execute!(
        {
          url: "https://example.com/slow",
          method: "GET",
          headers: {},
          timeoutMs: 50,
        },
        {} as any
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
    const { createFileTools } =
      await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const writeTool = tools.find((t) => t.name === "file_write")!;
    const readTool = tools.find((t) => t.name === "file_read")!;

    await writeTool.tool.execute!(
      { path: "test.txt", content: "hello from tool" },
      {} as any
    );

    const readResult = await readTool.tool.execute!(
      { path: "test.txt" },
      {} as any
    );
    expect(readResult.content).toBe("hello from tool");
    expect(readResult.truncated).toBe(false);
  });

  it("should list directory contents", async () => {
    const { createFileTools } =
      await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const writeTool = tools.find((t) => t.name === "file_write")!;
    const listTool = tools.find((t) => t.name === "file_list")!;

    await writeTool.tool.execute!({ path: "a.txt", content: "aaa" }, {} as any);
    await writeTool.tool.execute!({ path: "b.txt", content: "bbb" }, {} as any);

    const result = await listTool.tool.execute!({ path: "." }, {} as any);
    const names = result.entries.map((e: any) => e.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("b.txt");
  });

  it("should reject path traversal", async () => {
    const { createFileTools } =
      await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const readTool = tools.find((t) => t.name === "file_read")!;

    await expect(
      readTool.tool.execute!({ path: "../../etc/passwd" }, {} as any)
    ).rejects.toThrow("Path traversal denied");
  });

  it("should create parent directories when writing", async () => {
    const { createFileTools } =
      await import("../packages/agent-controller/src/tools/file-ops");
    const tools = createFileTools(tmpDir);
    const writeTool = tools.find((t) => t.name === "file_write")!;

    await writeTool.tool.execute!(
      { path: "deep/nested/dir/file.txt", content: "deep content" },
      {} as any
    );

    const content = await fs.readFile(
      path.join(tmpDir, "deep/nested/dir/file.txt"),
      "utf-8"
    );
    expect(content).toBe("deep content");
  });
});

// ---------------------------------------------------------------------------
// Code runner tool
// ---------------------------------------------------------------------------

describe("Code runner tool", () => {
  it("should execute JavaScript and return the result", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "2 + 2", timeoutMs: 5000 },
      {} as any
    );
    expect(result.result).toBe("4");
  });

  it("should capture console.log output", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      {
        code: "console.log('hello'); console.log('world'); 42",
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.output).toBe("hello\nworld");
    expect(result.result).toBe("42");
  });

  it("should not allow access to require", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "require('fs')", timeoutMs: 5000 },
      {} as any
    );
    expect(result.error).toBeDefined();
  });

  it("should not allow access to process", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "process.env", timeoutMs: 5000 },
      {} as any
    );
    expect(result.error).toBeDefined();
  });

  it("should timeout infinite loops", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "while(true){}", timeoutMs: 500 },
      {} as any
    );
    expect(result.error).toBeDefined();
    expect(result.error).toContain("timed out");
  }, 5000);

  it("should handle complex expressions", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
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
      {} as any
    );
    const parsed = JSON.parse(result.result);
    expect(parsed.sum).toBe(15);
    expect(parsed.avg).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Shell tool — edge cases
// ---------------------------------------------------------------------------

describe("Shell tool — edge cases", () => {
  it("should return non-zero exit code for a failing command", async () => {
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "sh", args: ["-c", "exit 42"], timeoutMs: 5000 },
      {} as any
    );
    expect(result.exitCode).toBe(42);
  });

  it("should expose an error message when the command is not found", async () => {
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "nonexistent_command_xyz_abc_999", args: [], timeoutMs: 5000 },
      {} as any
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  it("should run in a custom working directory", async () => {
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shell-cwd-test-"));
    try {
      const result = await shellTool.tool.execute!(
        { command: "pwd", args: [], cwd: tmpDir, timeoutMs: 5000 },
        {} as any
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toContain(path.basename(tmpDir));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("should truncate stdout that exceeds the size limit", async () => {
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    // Generate ~70 KB of output (limit is 64 KB)
    const result = await shellTool.tool.execute!(
      {
        command: "node",
        args: ["-e", "process.stdout.write('A'.repeat(70000))"],
        timeoutMs: 10000,
      },
      {} as any
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("... [output truncated]");
  });

  it("should handle a command with no args", async () => {
    const { shellTool } =
      await import("../packages/agent-controller/src/tools/shell");
    const result = await shellTool.tool.execute!(
      { command: "true", args: [], timeoutMs: 5000 },
      {} as any
    );
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// HTTP request tool — extended
// ---------------------------------------------------------------------------

describe("HTTP request tool — extended", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should POST with a JSON body and forward the body to fetch", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ received: true }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      );
    });

    const result = await httpRequestTool.tool.execute!(
      {
        url: "https://api.example.com/items",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "test" }),
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.status).toBe(201);
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.body).toContain("test");
  });

  it("should return body for text/html responses", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html><body>Hello</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );

    const result = await httpRequestTool.tool.execute!(
      {
        url: "https://example.com/",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.status).toBe(200);
    expect(result.body).toContain("Hello");
  });

  it("should describe binary responses without reading the body", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0, 1, 2, 3]).buffer as ArrayBuffer, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "4" },
      })
    );

    const result = await httpRequestTool.tool.execute!(
      {
        url: "https://example.com/logo.png",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.status).toBe(200);
    expect(result.body).toContain("[Binary response");
    expect(result.body).toContain("4");
  });

  it("should truncate large response bodies", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");
    const bigText = "x".repeat(200 * 1024); // 200 KB, limit is 128 KB
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(bigText, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const result = await httpRequestTool.tool.execute!(
      {
        url: "https://example.com/big",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.body).toContain("... [body truncated]");
  });

  it("should return an error body for non-AbortError network failures", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await httpRequestTool.tool.execute!(
      {
        url: "https://example.com/",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.status).toBe(0);
    expect(result.statusText).toBe("Error");
    expect(result.body).toContain("Failed to fetch");
  });

  it("should return response headers", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "abc-123",
        },
      })
    );

    const result = await httpRequestTool.tool.execute!(
      {
        url: "https://api.example.com/",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.headers["x-request-id"]).toBe("abc-123");
  });

  it("should return 4xx status codes without throwing", async () => {
    const { httpRequestTool } =
      await import("../packages/agent-controller/src/tools/http-request");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      })
    );

    const result = await httpRequestTool.tool.execute!(
      {
        url: "https://api.example.com/missing",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.status).toBe(404);
    expect(result.body).toContain("Not Found");
  });
});

// ---------------------------------------------------------------------------
// File ops tools — edge cases
// ---------------------------------------------------------------------------

describe("File ops tools — edge cases", () => {
  let tmpDir: string;
  let tools: Awaited<
    ReturnType<
      typeof import("../packages/agent-controller/src/tools/file-ops").createFileTools
    >
  >;
  let readTool: (typeof tools)[number];
  let writeTool: (typeof tools)[number];
  let listTool: (typeof tools)[number];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vaultysclaw-edge-"));
    const { createFileTools } =
      await import("../packages/agent-controller/src/tools/file-ops");
    tools = createFileTools(tmpDir);
    readTool = tools.find((t) => t.name === "file_read")!;
    writeTool = tools.find((t) => t.name === "file_write")!;
    listTool = tools.find((t) => t.name === "file_list")!;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should return an error (not throw) for a non-existent file", async () => {
    const result = await readTool.tool.execute!(
      { path: "does-not-exist.txt" },
      {} as any
    );
    expect(result.error).toBeDefined();
    expect(result.error).toContain("not found");
  });

  it("should return an error (not throw) when listing a non-existent directory", async () => {
    const result = await listTool.tool.execute!(
      { path: "no-such-dir" },
      {} as any
    );
    expect(result.error).toBeDefined();
  });

  it("should return an error when reading a directory as a file", async () => {
    await fs.mkdir(path.join(tmpDir, "subdir"));
    const result = await readTool.tool.execute!({ path: "subdir" }, {} as any);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("is not a file");
  });

  it("should reject absolute paths that point outside the workspace", async () => {
    await expect(
      readTool.tool.execute!({ path: "/etc/passwd" }, {} as any)
    ).rejects.toThrow("Path traversal denied");
  });

  it("should overwrite an existing file", async () => {
    await writeTool.tool.execute!(
      { path: "overwrite.txt", content: "first" },
      {} as any
    );
    await writeTool.tool.execute!(
      { path: "overwrite.txt", content: "second" },
      {} as any
    );
    const result = await readTool.tool.execute!(
      { path: "overwrite.txt" },
      {} as any
    );
    expect(result.content).toBe("second");
  });

  it("should write and read back empty content", async () => {
    await writeTool.tool.execute!(
      { path: "empty.txt", content: "" },
      {} as any
    );
    const result = await readTool.tool.execute!(
      { path: "empty.txt" },
      {} as any
    );
    expect(result.content).toBe("");
    expect(result.truncated).toBe(false);
  });

  it("should truncate large file reads", async () => {
    const bigContent = "X".repeat(300 * 1024); // 300 KB, limit is 256 KB
    await writeTool.tool.execute!(
      { path: "big.txt", content: bigContent },
      {} as any
    );
    const result = await readTool.tool.execute!({ path: "big.txt" }, {} as any);
    expect(result.truncated).toBe(true);
    expect(result.content).toContain("[truncated]");
  });

  it("should report file size in the read result", async () => {
    await writeTool.tool.execute!(
      { path: "sized.txt", content: "hello" },
      {} as any
    );
    const result = await readTool.tool.execute!(
      { path: "sized.txt" },
      {} as any
    );
    expect(result.size).toBe(5);
  });

  it("should list files with their type", async () => {
    await writeTool.tool.execute!(
      { path: "file.txt", content: "x" },
      {} as any
    );
    await fs.mkdir(path.join(tmpDir, "folder"));
    const result = await listTool.tool.execute!({ path: "." }, {} as any);
    const file = result.entries.find((e: any) => e.name === "file.txt");
    const folder = result.entries.find((e: any) => e.name === "folder");
    expect(file?.type).toBe("file");
    expect(folder?.type).toBe("directory");
  });

  it("should report bytes written", async () => {
    const result = await writeTool.tool.execute!(
      { path: "bytes.txt", content: "hello" },
      {} as any
    );
    expect(result.bytes).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Code runner tool — edge cases
// ---------------------------------------------------------------------------

describe("Code runner tool — edge cases", () => {
  it("should handle non-Error throws gracefully", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "throw 'something went wrong'", timeoutMs: 5000 },
      {} as any
    );
    expect(result.error).toBeDefined();
    expect(result.error).toContain("something went wrong");
  });

  it("should capture console.warn and console.error output", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      {
        code: "console.warn('a warning'); console.error('an error'); 'done'",
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.output).toContain("[warn] a warning");
    expect(result.output).toContain("[error] an error");
    expect(result.result).toBe("done");
  });

  it("should return null result for code that evaluates to undefined", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "let x = 1; void x;", timeoutMs: 5000 },
      {} as any
    );
    expect(result.result).toBeNull();
  });

  it("should correctly stringify falsy-but-defined results (false, 0)", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const falseResult = await codeRunnerTool.tool.execute!(
      { code: "false", timeoutMs: 5000 },
      {} as any
    );
    expect(falseResult.result).toBe("false");

    const zeroResult = await codeRunnerTool.tool.execute!(
      { code: "0", timeoutMs: 5000 },
      {} as any
    );
    expect(zeroResult.result).toBe("0");
  });

  it("should block access to global and globalThis Node.js globals", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "global.process.env.HOME", timeoutMs: 5000 },
      {} as any
    );
    expect(result.error).toBeDefined();
  });

  it("should support Math, Date, Map, and Set globals", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      {
        code: `
          const m = new Map([['a', 1]]);
          const s = new Set([1, 1, 2]);
          const d = new Date(0).toISOString();
          JSON.stringify({ mapSize: m.size, setSize: s.size, epoch: d, sqrt: Math.sqrt(9) })
        `,
        timeoutMs: 5000,
      },
      {} as any
    );
    const parsed = JSON.parse(result.result);
    expect(parsed.mapSize).toBe(1);
    expect(parsed.setSize).toBe(2);
    expect(parsed.epoch).toBe("1970-01-01T00:00:00.000Z");
    expect(parsed.sqrt).toBe(3);
  });

  it("should include partial console output even when execution throws", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      {
        code: "console.log('before'); throw new Error('boom'); console.log('after')",
        timeoutMs: 5000,
      },
      {} as any
    );
    expect(result.error).toBeDefined();
    expect(result.output).toContain("before");
    expect(result.output).not.toContain("after");
  });

  it("should truncate very large output", async () => {
    const { codeRunnerTool } =
      await import("../packages/agent-controller/src/tools/code-runner");
    const result = await codeRunnerTool.tool.execute!(
      { code: "'X'.repeat(70000)", timeoutMs: 5000 },
      {} as any
    );
    expect(result.result).toContain("... [truncated]");
  });
});

// ---------------------------------------------------------------------------
// Tool approval integration (via WebSocket)
// ---------------------------------------------------------------------------

describe("Tool approval integration", () => {
  it("should have getPendingToolApprovals method on WS server", async () => {
    // Verify the WS server module exports the needed types
    const { AgentWSServer } =
      await import("../packages/control-plane/lib/ws-server");
    expect(typeof AgentWSServer.prototype.getPendingToolApprovals).toBe(
      "function"
    );
    expect(typeof AgentWSServer.prototype.respondToToolApproval).toBe(
      "function"
    );
  });
});
