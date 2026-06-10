/**
 * HTTP request tool — maps to "api_call" and "internet_access" capabilities.
 *
 * Makes HTTP requests and returns status, headers, and body.
 * HTML responses are automatically converted to clean markdown text via:
 *   1. Docling server (if DOCLING_URL env var is set)
 *   2. Built-in zero-dependency HTML cleaner (fallback)
 *
 * GET requests do not require approval; other methods do.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolDefinition } from "./types";
import { htmlToText } from "./html-cleaner";

// Raw HTML fetch limit — generous before cleaning since HTML is very noisy
const MAX_HTML_FETCH_BYTES = 1024 * 1024; // 1 MB
// Clean text/markdown limit — after cleaning, content is dense enough at 64 KB
const MAX_CLEAN_TEXT_BYTES = 64 * 1024; // 64 KB
// Limit for non-HTML text responses (JSON, plain text, XML)
const MAX_BODY_BYTES = 128 * 1024; // 128 KB
const DEFAULT_TIMEOUT_MS = 30_000;

function truncate(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s) <= maxBytes) return s;
  return (
    Buffer.from(s).subarray(0, maxBytes).toString("utf-8") +
    "\n... [truncated]"
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
      "Useful for calling APIs, fetching web pages, or sending webhooks. " +
      "HTML pages are automatically converted to clean readable text.",
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
      raw_html: z
        .boolean()
        .default(false)
        .describe(
          "Set to true to receive the raw HTML instead of the cleaned text (default false)"
        ),
    }),
    execute: async ({ url, method, headers, body, timeoutMs, raw_html }) => {
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
        const isHtml =
          contentType.includes("text/html") ||
          contentType.includes("application/xhtml");

        let responseBody: string;
        let cleaningMethod: string | undefined;

        if (isHtml && !(raw_html ?? false)) {
          // Fetch with a higher limit — cleaning will reduce size significantly
          const rawHtml = truncate(await res.text(), MAX_HTML_FETCH_BYTES);
          const { text, method: cm } = await htmlToText(rawHtml, url);
          responseBody = truncate(text, MAX_CLEAN_TEXT_BYTES);
          cleaningMethod = cm;
        } else if (contentType.includes("application/json")) {
          responseBody = truncate(await res.text(), MAX_BODY_BYTES);
        } else if (
          contentType.startsWith("text/") ||
          contentType.includes("xml")
        ) {
          responseBody = truncate(await res.text(), MAX_BODY_BYTES);
        } else {
          responseBody = `[Binary response, ${res.headers.get("content-length") ?? "unknown"} bytes, content-type: ${contentType}]`;
        }

        // Convert headers to a plain object
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
          ...(cleaningMethod ? { html_cleaned_by: cleaningMethod } : {}),
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
