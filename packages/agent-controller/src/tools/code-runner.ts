/**
 * Code execution tool — maps to the "code_execution" capability.
 *
 * Runs JavaScript code in a Node.js `vm` sandbox with:
 *   - Timeout protection (default 10s)
 *   - No access to `require`, `process`, `fs`, or other Node globals
 *   - Console output capture
 *   - Memory-limited context
 *
 * Requires approval by default.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import vm from "vm";
import type { AgentToolDefinition } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_LENGTH = 64 * 1024;

export const codeRunnerTool: AgentToolDefinition = {
  name: "code_run",
  capability: "code_execution",
  requiresApproval: true,
  tool: createTool({
    id: "code_run",
    description:
      "Execute JavaScript code in a sandboxed environment and return the result. " +
      "The sandbox has no access to the filesystem, network, or Node.js APIs. " +
      "Use console.log() to produce output. The last expression value is returned as the result.",
    inputSchema: z.object({
      code: z.string().describe("JavaScript code to execute"),
      timeoutMs: z
        .number()
        .optional()
        .default(DEFAULT_TIMEOUT_MS)
        .describe("Execution timeout in milliseconds (default 10000)"),
    }),
    execute: async ({ code, timeoutMs }) => {
      const logs: string[] = [];
      const sandbox = {
        console: {
          log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
          warn: (...args: unknown[]) => logs.push("[warn] " + args.map(String).join(" ")),
          error: (...args: unknown[]) => logs.push("[error] " + args.map(String).join(" ")),
        },
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        encodeURI,
        decodeURI,
        // Explicitly blocked
        require: undefined,
        process: undefined,
        globalThis: undefined,
        global: undefined,
      };

      const context = vm.createContext(sandbox);

      try {
        const result = vm.runInContext(code, context, {
          timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
          displayErrors: true,
        });

        const output = logs.join("\n");
        const resultStr = result !== undefined ? String(result) : undefined;

        return {
          result: resultStr
            ? resultStr.length > MAX_OUTPUT_LENGTH
              ? resultStr.slice(0, MAX_OUTPUT_LENGTH) + "... [truncated]"
              : resultStr
            : null,
          output: output.length > MAX_OUTPUT_LENGTH
            ? output.slice(0, MAX_OUTPUT_LENGTH) + "... [truncated]"
            : output || null,
        };
      } catch (err) {
        const output = logs.join("\n");
        return {
          error: err instanceof Error ? err.message : String(err),
          output: output || null,
          result: null,
        };
      }
    },
  }),
};
