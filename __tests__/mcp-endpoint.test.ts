/**
 * Tests for the MCP JSON-RPC endpoint: POST /api/mcp
 *
 * Uses the same mocking strategy as security.test.ts / llm-config-routes.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/mcp/tools", () => ({
  MCP_TOOLS: [{ name: "vc_list_agents", description: "list", inputSchema: {} }],
  callMcpTool: vi.fn(),
}));

vi.mock("@/lib/api/utils/api-utils", async () => {
  const actual = await vi.importActual<typeof import("../packages/control-plane/lib/api/utils/api-utils")>(
    "../packages/control-plane/lib/api/utils/api-utils"
  );
  return actual;
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { getAuthContext } from "../packages/control-plane/lib/auth-utils";
import { callMcpTool } from "../packages/control-plane/lib/mcp/tools";
import { APIException } from "../packages/control-plane/lib/api/utils/api-utils";
import { POST } from "../packages/control-plane/app/api/mcp/route";

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>;
const mockCallMcpTool = callMcpTool as ReturnType<typeof vi.fn>;

function rpcRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/mcp", { body }) as unknown as NextRequest;
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({ did: "did:test:owner", isGlobalAdmin: true });
  });

  it("rejects requests without a valid session or API key", async () => {
    mockGetAuthContext.mockRejectedValue(new APIException("UNAUTHORIZED"));
    const res = await POST(rpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect((res as any).status).toBe(401);
  });

  it("returns the tool list for tools/list", async () => {
    const res = await POST(rpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    const json = await (res as any).json();
    expect(json.result.tools).toHaveLength(1);
    expect(json.result.tools[0].name).toBe("vc_list_agents");
  });

  it("dispatches tools/call to callMcpTool and wraps the result", async () => {
    mockCallMcpTool.mockResolvedValue({ agents: [] });
    const res = await POST(
      rpcRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "vc_list_agents", arguments: {} },
      })
    );
    const json = await (res as any).json();
    expect(mockCallMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({ did: "did:test:owner" }),
      "vc_list_agents",
      {}
    );
    expect(json.result.content[0].text).toBe(JSON.stringify({ agents: [] }));
  });

  it("returns isError content when the tool throws", async () => {
    mockCallMcpTool.mockRejectedValue(new Error("Agent not found or not connected"));
    const res = await POST(
      rpcRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "vc_run_intent", arguments: { agentDid: "x", action: "y" } },
      })
    );
    const json = await (res as any).json();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain("Agent not found");
  });

  it("returns a JSON-RPC error for unknown methods", async () => {
    const res = await POST(rpcRequest({ jsonrpc: "2.0", id: 4, method: "not/a/method" }));
    const json = await (res as any).json();
    expect(json.error.code).toBe(-32601);
  });
});
