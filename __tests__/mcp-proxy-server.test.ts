/**
 * Integration test for @vaultysclaw/mcp-proxy's MCP tool surface
 * (packages/mcp-proxy/src/mcp-server.ts). Drives the tool end-to-end through
 * the real MCP Client/Server protocol (in-memory transport pair), exercising
 * the same evaluateRequest/forwardRequest pipeline as
 * __tests__/proxy-http-server.test.ts, but through vc_proxy_request instead
 * of calling the functions directly — verifies the package boundary
 * (@vaultysclaw/proxy's public.ts export surface) actually works end-to-end.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LocalDb } from "@vaultysclaw/proxy";
import type { WSProxyConfigPayload } from "@vaultysclaw/shared";

const UPSTREAM = { id: "u1", name: "upstream", baseUrl: "https://api.example.com" };

describe("mcp-proxy vc_proxy_request tool", () => {
  let dbPath: string;
  let localDb: LocalDb;
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn>;
  let stopServer: () => void;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `mcp-proxy-test-${Date.now()}-${Math.random()}.db`);
    localDb = new LocalDb(dbPath);

    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { buildServerForTest } = await import("../packages/mcp-proxy/src/mcp-server");
    const runtime = {
      reportActivityLog: vi.fn(),
      reportError: vi.fn(),
    } as any;

    const server = buildServerForTest(localDb, runtime);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    stopServer = () => {
      void client.close();
      void server.close();
    };
  });

  afterEach(() => {
    stopServer();
    vi.unstubAllGlobals();
    localDb.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
  });

  function saveConfig(overrides: Partial<WSProxyConfigPayload>) {
    localDb.saveConfig({
      defaultMode: "deny",
      upstreams: [UPSTREAM],
      rules: [],
      principals: [],
      ...overrides,
    });
  }

  it("lists exactly one tool: vc_proxy_request", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("vc_proxy_request");
  });

  it("forwards and returns the upstream response for a no_check rule", async () => {
    saveConfig({
      rules: [{ id: "r1", method: "GET", urlPattern: "*", mode: "no_check" }],
    });

    const result = await client.callTool({
      name: "vc_proxy_request",
      arguments: { method: "GET", path: "/orders" },
    });

    expect(result.isError).toBeFalsy();
    const content = (result.content as any[])[0].text;
    const parsed = JSON.parse(content);
    expect(parsed.status).toBe(200);
    expect(JSON.parse(parsed.body)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/orders",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns isError with the denial reason for a governed rule with no config synced", async () => {
    const result = await client.callTool({
      name: "vc_proxy_request",
      arguments: { method: "GET", path: "/orders" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as any[])[0].text).toMatch(/no synced configuration/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("denies (no upstream call) when the default mode is deny and no rule matches", async () => {
    saveConfig({ defaultMode: "deny", rules: [] });
    const result = await client.callTool({
      name: "vc_proxy_request",
      arguments: { method: "GET", path: "/unmatched" },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as any[])[0].text);
    expect(parsed.error).toMatch(/No rule matched/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns isError for an unknown tool name instead of forwarding anything", async () => {
    const result = await client.callTool({ name: "nonexistent_tool", arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as any[])[0].text).toMatch(/Unknown tool/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed call missing required arguments", async () => {
    const result = await client.callTool({
      name: "vc_proxy_request",
      arguments: { path: "/orders" },
    });
    expect(result.isError).toBe(true);
  });
});
