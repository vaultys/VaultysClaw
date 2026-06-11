/**
 * Code execution tool — maps to the "code_execution" capability.
 *
 * Runs JavaScript code in an isolated V8 Isolate via `isolated-vm`.
 * Each call gets a fresh Isolate, so there is no shared state between
 * runs and no access to Node.js internals regardless of prototype tricks.
 *
 * Requires approval by default.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import ivm from "isolated-vm";
import type { AgentToolDefinition } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_LENGTH = 64 * 1024;
const ISOLATE_MEMORY_MB = 32;

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
      const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

      const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_MB });
      try {
        const context = await isolate.createContext();

        // Bridge console methods back to Node.js.
        // evalClosure substitutes $0/$1/$2 with References, and applySync
        // calls the Node.js function synchronously from within the isolate.
        await context.evalClosure(
          `globalThis.console = {
            log:   (...a) => $0.applySync(undefined, a),
            warn:  (...a) => $1.applySync(undefined, a),
            error: (...a) => $2.applySync(undefined, a),
          };`,
          [
            new ivm.Reference((...args: unknown[]) =>
              logs.push(args.map(String).join(" "))
            ),
            new ivm.Reference((...args: unknown[]) =>
              logs.push("[warn] " + args.map(String).join(" "))
            ),
            new ivm.Reference((...args: unknown[]) =>
              logs.push("[error] " + args.map(String).join(" "))
            ),
          ],
          { timeout }
        );

        const script = await isolate.compileScript(code);
        const result = await script.run(context, { timeout, copy: true });

        const output = logs.join("\n");
        const resultStr =
          result !== undefined && result !== null ? String(result) : undefined;

        return {
          result: resultStr
            ? resultStr.length > MAX_OUTPUT_LENGTH
              ? resultStr.slice(0, MAX_OUTPUT_LENGTH) + "... [truncated]"
              : resultStr
            : null,
          output:
            output.length > MAX_OUTPUT_LENGTH
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
      } finally {
        isolate.dispose();
      }
    },
  }),
};
