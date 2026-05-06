/**
 * JSON API skill — structured REST API client with response parsing.
 *
 * Requires "api_call" capability. Provides helpers beyond the raw http_request
 * tool: automatically parses JSON, handles pagination hints, and supports
 * bearer token auth injection from the agent's environment.
 */

import { tool } from "ai";
import { z } from "zod";
import type { SkillDefinition } from "../../src/skills/types.js";

const MAX_BODY = 256 * 1024;
const DEFAULT_TIMEOUT = 30_000;

export const skill: SkillDefinition = {
  name: "json-api",
  description: "Structured REST API client with JSON parsing and auth helpers",
  version: "1.0.0",
  tools: [
    {
      name: "api_call_json",
      capability: "api_call",
      requiresApproval: false,
      tool: tool({
        description:
          "Call a JSON REST API and return a parsed response object. " +
          "Handles authentication via Bearer token. " +
          "Returns the parsed JSON body and relevant metadata.",
        inputSchema: z.object({
          url: z.string().url().describe("API endpoint URL"),
          method: z
            .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
            .optional()
            .default("GET")
            .describe("HTTP method"),
          headers: z
            .record(z.string(), z.string())
            .optional()
            .default({})
            .describe("Additional request headers"),
          bearerToken: z
            .string()
            .optional()
            .describe("Bearer token for Authorization header"),
          body: z
            .unknown()
            .optional()
            .describe("Request body (will be JSON-serialized)"),
          timeoutMs: z
            .number()
            .optional()
            .default(DEFAULT_TIMEOUT)
            .describe("Request timeout in milliseconds"),
        }),
        execute: async ({ url, method, headers, bearerToken, body, timeoutMs }) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT);

          const reqHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...((headers as Record<string, string>) ?? {}),
          };

          if (bearerToken) {
            reqHeaders["Authorization"] = `Bearer ${bearerToken}`;
          }

          try {
            const res = await fetch(url, {
              method: method ?? "GET",
              headers: reqHeaders,
              body: body !== undefined ? JSON.stringify(body) : undefined,
              signal: controller.signal,
            });

            const text = await res.text();
            const truncated = text.length > MAX_BODY;
            const truncText = truncated ? text.slice(0, MAX_BODY) + "..." : text;

            let parsed: unknown = truncText;
            try {
              parsed = JSON.parse(text);
            } catch {
              // Not JSON — return raw text
            }

            return {
              status: res.status,
              ok: res.ok,
              data: parsed,
              truncated,
            };
          } catch (err) {
            if ((err as Error).name === "AbortError") {
              return { status: 0, ok: false, data: null, error: "Request timed out" };
            }
            return { status: 0, ok: false, data: null, error: String(err) };
          } finally {
            clearTimeout(timer);
          }
        },
      }),
    },
  ],
  systemPromptExtension:
    "Use 'api_call_json' for structured API calls — it automatically parses JSON responses " +
    "and handles Bearer token authentication. Prefer it over 'http_request' when calling REST APIs.",
};
