/**
 * HTTP request tool — maps to "api_call" and "internet_access" capabilities.
 *
 * Makes HTTP requests and returns status, headers, and body.
 * GET requests do not require approval; other methods do.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolDefinition } from "./types";

const MAX_BODY_BYTES = 128 * 1024; // 128 KB
const DEFAULT_TIMEOUT_MS = 30_000;

function truncateBody(s: string): string {
  if (Buffer.byteLength(s) <= MAX_BODY_BYTES) return s;
  return (
    Buffer.from(s).subarray(0, MAX_BODY_BYTES).toString("utf-8") +
    "\n... [body truncated]"
  );
}

export const httpRequestTool: AgentToolDefinition = {
  name: "http_request",
  capability: "api_call",
  requiresApproval: false, // approval controlled per-method at runtime in the approval gate
  tool: createTool({
    id: "http_request",
    description:
      "Make an HTTP request to a URL and return the response. " +
      "Useful for calling APIs, fetching web pages, or sending webhooks.",
    inputSchema: z.object({
      url: z.string().url().describe("The URL to request"),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
        .default("GET")
        .describe("HTTP method (default GET)"),
      headers: z
        .record(z.string(), z.string())
        .default({})
        .describe("Request headers as key-value pairs"),
      body: z
        .string()
        .optional()
        .describe("Request body (for POST/PUT/PATCH). Send JSON as a string."),
      timeoutMs: z
        .number()
        .default(DEFAULT_TIMEOUT_MS)
        .describe("Request timeout in milliseconds (default 30000)"),
    }),
    execute: async ({ url, method, headers, body, timeoutMs }) => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        timeoutMs ?? DEFAULT_TIMEOUT_MS
      );

      try {
        const res = await fetch(url, {
          method: method ?? "GET",
          headers: headers ?? {},
          body: body ?? undefined,
          signal: controller.signal,
        });

        const contentType = res.headers.get("content-type") ?? "";
        let responseBody: string;

        if (contentType.includes("application/json")) {
          const text = await res.text();
          responseBody = truncateBody(text);
        } else if (
          contentType.startsWith("text/") ||
          contentType.includes("xml")
        ) {
          responseBody = truncateBody(await res.text());
        } else {
          responseBody = `[Binary response, ${res.headers.get("content-length") ?? "unknown"} bytes]`;
        }

        // Convert headers to object - use entries() if available, otherwise iterate manually
        const headersObj: Record<string, string> = {};
        const headersAny = res.headers as any;
        if (typeof headersAny.entries === "function") {
          for (const [key, value] of headersAny.entries()) {
            headersObj[key] = value;
          }
        } else if (res.headers instanceof Map) {
          for (const [key, value] of res.headers) {
            headersObj[key] = value;
          }
        }
        return {
          status: res.status,
          statusText: res.statusText,
          headers: headersObj,
          body: responseBody,
        };
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return {
            status: 0,
            statusText: "Timeout",
            headers: {},
            body: `Request timed out after ${timeoutMs}ms`,
          };
        }
        return {
          status: 0,
          statusText: "Error",
          headers: {},
          body: String(err),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  }),
};
