/**
 * MCP front-end for the proxy — lets an MCP client (Claude Code, Claude
 * Desktop, or any customer workflow tool that already speaks MCP) call
 * through the same governance pipeline as the raw HTTP listener
 * (`http-server.ts`), without needing to embed an HTTP client at all.
 *
 * Exposes a single tool, `vc_proxy_request`, that runs `evaluateRequest`
 * (identity resolution + rule matching, shared verbatim with the HTTP path)
 * and forwards on allow. Two transports:
 *   - stdio (default): for local MCP clients (Claude Desktop config, etc).
 *   - streamable HTTP: when `MCP_HTTP_PORT` is set, for remote/customer
 *     workflow tools that can't spawn a subprocess.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { evaluateRequest, forwardRequest } from "./http-server.js";
import type { LocalDb } from "./local-db.js";
import type { ProxyRuntime } from "./proxy-runtime.js";

const ProxyRequestSchema = z.object({
  method: z.string().describe("HTTP method, e.g. GET, POST"),
  path: z.string().describe("Path (and query string) on the configured upstream, e.g. /v1/orders?status=open"),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().describe("Request body as a raw string (JSON should be pre-serialized)"),
});

function buildServer(localDb: LocalDb, runtime: ProxyRuntime): Server {
  const server = new Server(
    { name: "vaultysclaw-proxy", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vc_proxy_request",
        description:
          "Make an HTTP request through this VaultysClaw proxy's governance rules. " +
          "The request is matched against the proxy's configured rules exactly like the raw " +
          "HTTP listener: no_check rules pass straight through, governed rules require a " +
          "recognized, authorized Principal, and unmatched requests follow the proxy's default " +
          "mode (passthrough or deny). Returns the upstream status/headers/body, or a 403 with " +
          "the reason when denied.",
        inputSchema: {
          type: "object",
          required: ["method", "path"],
          properties: {
            method: { type: "string", description: "HTTP method, e.g. GET, POST" },
            path: { type: "string", description: "Path (and query string) on the configured upstream" },
            headers: { type: "object", description: "Extra request headers" },
            body: { type: "string", description: "Raw request body" },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    if (name !== "vc_proxy_request") {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }

    try {
      const args = ProxyRequestSchema.parse(rawArgs ?? {});
      const bodyBuffer = Buffer.from(args.body ?? "", "utf8");
      const headers: Record<string, string | string[] | undefined> = { ...args.headers };

      const evaluated = await evaluateRequest(args.method, args.path, headers, bodyBuffer, localDb);

      if ("error" in evaluated) {
        return { content: [{ type: "text", text: evaluated.error }], isError: true };
      }

      runtime.reportActivityLog([
        {
          method: args.method.toUpperCase(),
          url: evaluated.fullUrl,
          ruleId: evaluated.rule?.id,
          mode: evaluated.mode,
          verdict: evaluated.verdict,
          reason: evaluated.reason,
          principalDid: evaluated.principalDid,
          externalId: evaluated.externalId,
          identitySource: evaluated.identitySource,
          timestamp: new Date().toISOString(),
          latencyMs: 0,
        },
      ]);

      if (evaluated.verdict === "deny") {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: evaluated.reason ?? "Denied" }) }],
          isError: true,
        };
      }

      const forwarded = await forwardRequest(args.method, evaluated.fullUrl, headers, bodyBuffer);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: forwarded.status,
              headers: forwarded.headers,
              body: forwarded.body.toString("utf8"),
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}

/** Start the MCP front-end over stdio (default). */
export async function startMcpStdioServer(localDb: LocalDb, runtime: ProxyRuntime): Promise<void> {
  const server = buildServer(localDb, runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** Start the MCP front-end over streamable HTTP, for clients that can't spawn a subprocess. */
export function startMcpHttpServer(
  port: number,
  localDb: LocalDb,
  runtime: ProxyRuntime
): { stop: () => void } {
  const server = buildServer(localDb, runtime);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const ready = server.connect(transport);

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    ready
      .then(() => transport.handleRequest(req, res))
      .catch((err) => {
        runtime.reportError("Unhandled error in MCP HTTP transport", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "internal mcp server error" }));
        }
      });
  });
  httpServer.listen(port);

  return { stop: () => httpServer.close() };
}
