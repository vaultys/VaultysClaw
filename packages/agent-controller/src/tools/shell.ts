/**
 * Shell command tool — maps to the "system_command" capability.
 *
 * Executes a shell command in a child process with:
 *   - Configurable timeout (default 30s)
 *   - Output size limit (default 64 KB)
 *   - No shell injection via explicit argv splitting
 *
 * Requires approval by default.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { execFile } from "child_process";
import type { AgentToolDefinition } from "./types";

const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB
const DEFAULT_TIMEOUT_MS = 30_000;  // 30 seconds

function truncate(s: string, max: number): string {
  if (Buffer.byteLength(s) <= max) return s;
  const truncated = Buffer.from(s).subarray(0, max).toString("utf-8");
  return truncated + "\n... [output truncated]";
}

export const shellTool: AgentToolDefinition = {
  name: "shell",
  capability: "system_command",
  requiresApproval: true,
  tool: createTool({
    id: "shell",
    description:
      "Execute a shell command and return its stdout/stderr. " +
      "Use this for system administration tasks, file listing, process management, etc. " +
      "The command runs with a timeout and output size limit.",
    inputSchema: z.object({
      command: z
        .string()
        .describe("The command to execute (e.g. 'ls', 'cat', 'grep')"),
      args: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Arguments to pass to the command (e.g. ['-la', '/tmp'])"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for the command. Defaults to the agent's cwd."),
      timeoutMs: z
        .number()
        .optional()
        .default(DEFAULT_TIMEOUT_MS)
        .describe("Maximum execution time in milliseconds (default 30000)"),
    }),
    execute: async ({ command, args, cwd, timeoutMs }) => {
      return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
        const child = execFile(
          command,
          args,
          {
            timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxBuffer: MAX_OUTPUT_BYTES * 2,
            cwd: cwd || undefined,
            env: { ...process.env, TERM: "dumb" },
          },
          (error, stdout, stderr) => {
            const exitCode = error
              ? (error as any).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
                ? 1
                : (child.exitCode ?? 1)
              : 0;

            resolve({
              exitCode,
              stdout: truncate(String(stdout), MAX_OUTPUT_BYTES),
              stderr: truncate(String(stderr), MAX_OUTPUT_BYTES),
            });
          },
        );
      });
    },
  }),
};
