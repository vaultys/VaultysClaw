/**
 * File operations tool — maps to the "file_access" capability.
 *
 * Provides read, write, list, and stat operations on the local filesystem.
 * All paths are resolved relative to a configurable workspace root and
 * validated to prevent path-traversal attacks.
 *
 * Write operations require approval; reads do not.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import type { AgentToolDefinition } from "./types";

const MAX_READ_BYTES = 256 * 1024; // 256 KB

/** Resolve and validate a path against the workspace root. Throws on traversal. */
function safePath(workspaceRoot: string, userPath: string): string {
  const resolved = path.resolve(workspaceRoot, userPath);
  if (!resolved.startsWith(workspaceRoot + path.sep) && resolved !== workspaceRoot) {
    throw new Error(`Path traversal denied: "${userPath}" resolves outside workspace`);
  }
  return resolved;
}

/** Create file-ops tools bound to a workspace root. */
export function createFileTools(workspaceRoot: string): AgentToolDefinition[] {
  const root = path.resolve(workspaceRoot);

  const readFile: AgentToolDefinition = {
    name: "file_read",
    capability: "file_access",
    requiresApproval: false,
    tool: createTool({
      id: "file_read",
      description: "Read the contents of a file. Returns text content (up to 256 KB).",
      inputSchema: z.object({
        path: z.string().describe("File path relative to the workspace root"),
      }),
      execute: async ({ path: filePath }) => {
        const resolved = safePath(root, filePath);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) return { error: `"${filePath}" is not a file` };
        if (stat.size > MAX_READ_BYTES) {
          const buf = Buffer.alloc(MAX_READ_BYTES);
          const fd = await fs.open(resolved, "r");
          await fd.read(buf, 0, MAX_READ_BYTES, 0);
          await fd.close();
          return { content: buf.toString("utf-8") + "\n... [truncated]", size: stat.size, truncated: true };
        }
        const content = await fs.readFile(resolved, "utf-8");
        return { content, size: stat.size, truncated: false };
      },
    }),
  };

  const writeFile: AgentToolDefinition = {
    name: "file_write",
    capability: "file_access",
    requiresApproval: true,
    tool: createTool({
      id: "file_write",
      description: "Write content to a file. Creates parent directories if needed. Overwrites existing files.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to the workspace root"),
        content: z.string().describe("Content to write to the file"),
      }),
      execute: async ({ path: filePath, content }) => {
        const resolved = safePath(root, filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");
        return { written: filePath, bytes: Buffer.byteLength(content) };
      },
    }),
  };

  const listDir: AgentToolDefinition = {
    name: "file_list",
    capability: "file_access",
    requiresApproval: false,
    tool: createTool({
      id: "file_list",
      description: "List files and directories at a given path.",
      inputSchema: z.object({
        path: z.string().default(".").describe("Directory path relative to workspace root"),
      }),
      execute: async ({ path: dirPath }) => {
        const resolved = safePath(root, dirPath ?? ".");
        const entries = await fs.readdir(resolved, { withFileTypes: true });
        return {
          entries: entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : e.isFile() ? "file" : "other",
          })),
        };
      },
    }),
  };

  return [readFile, writeFile, listDir];
}
