import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException, HttpCodes } from "@/lib/api/utils/api-utils";
import { MCP_TOOLS, callMcpTool } from "@/lib/mcp/tools";

/**
 * MCP endpoint — exposes a subset of the control plane API as MCP tools over
 * plain JSON-RPC 2.0 (the "stateless Streamable HTTP" mode from the MCP spec:
 * one JSON-RPC request per POST, one JSON response, no SSE session).
 *
 * Auth: NextAuth session or API key (see getAuthContext), same as any other
 * /api/* route. An API key must have "POST /api/mcp" in its allowedRoutes.
 *
 * This is a companion to packages/mcp-gateway (a full VaultysId agent run as
 * a separate stdio process) for clients that just want a remote HTTP MCP
 * endpoint reachable with a bearer API key.
 */

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status: 200 } // JSON-RPC errors are carried in the body, not the HTTP status
  );
}

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: invalid JSON");
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(body.id, -32600, "Invalid Request");
  }

  // Notifications (no id) never get a response body per JSON-RPC 2.0.
  const isNotification = body.id === undefined;

  let auth;
  try {
    auth = await getAuthContext(request);
  } catch (err) {
    if (err instanceof APIException) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: HttpCodes[err.code] }
      );
    }
    throw err;
  }

  try {
    switch (body.method) {
      case "initialize":
        return rpcResult(body.id, {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "vaultysclaw", version: "0.0.1" },
          capabilities: { tools: {} },
        });

      case "notifications/initialized":
        return isNotification
          ? new NextResponse(null, { status: 202 })
          : rpcResult(body.id, {});

      case "tools/list":
        return rpcResult(body.id, { tools: MCP_TOOLS });

      case "tools/call": {
        const toolName = body.params?.name as string | undefined;
        const toolArgs =
          (body.params?.arguments as Record<string, unknown>) ?? {};
        if (!toolName) return rpcError(body.id, -32602, "Missing tool name");

        try {
          const result = await callMcpTool(auth, toolName, toolArgs);
          return rpcResult(body.id, {
            content: [{ type: "text", text: JSON.stringify(result) }],
          });
        } catch (err) {
          return rpcResult(body.id, {
            content: [
              { type: "text", text: err instanceof Error ? err.message : String(err) },
            ],
            isError: true,
          });
        }
      }

      default:
        return rpcError(body.id, -32601, `Method not found: ${body.method}`);
    }
  } catch (err) {
    return rpcError(
      body.id,
      -32603,
      err instanceof Error ? err.message : "Internal error"
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "vaultysclaw",
    protocol: "mcp",
    transport: "streamable-http-stateless",
    endpoint: "/api/mcp",
    hint: "POST JSON-RPC 2.0 requests here (initialize, tools/list, tools/call). Authenticate with a session cookie or an API key (x-api-key or Bearer) whose allowedRoutes include \"POST /api/mcp\".",
  });
}
