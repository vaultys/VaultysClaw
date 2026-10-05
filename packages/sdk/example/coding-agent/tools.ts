/**
 * The agent's four tools, and what each one costs in authority.
 *
 * Each tool is described to the model (`TOOLS`) and mapped to a capability + resource
 * (`toGateRequest`) — the same mapping the sensor's supervisor applies to Claude Code
 * (docs/HARNESS_SUPERVISOR.md §4.2): reads are `file_read`, writes are `file_write`, running
 * anything is `code_execution` on `exec://<argv0>`. The model only ever *asks*; nothing here runs
 * until the guard has said yes.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import { FLOOR_DIRS, FLOOR_FILE_GLOBS, type GateRequest } from "./guard.js";

const run = promisify(execFile);
const MAX_OUTPUT = 20_000;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_code",
    description:
      "Search the workspace for a literal string. Returns matching lines as path:line:text, " +
      "paths relative to the workspace root.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Literal text to search for." } },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "read_file",
    description: "Read a text file, given its path relative to the workspace root.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "edit_file",
    description:
      "Replace one exact occurrence of old_text with new_text in a file. To create a file, " +
      "pass an empty old_text and the full contents as new_text. Fails with a precise message " +
      "if old_text is missing or ambiguous.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "run_tests",
    description: "Run the project's test command and return its exit code and output.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
];

export interface ToolContext {
  workspaceRoot: string;
  /** argv, not a shell string — `exec://<argv[0]>` is what the certificate scopes. */
  testCommand: string[];
}

type Input = Record<string, string>;

/** Resolves a model-supplied path to an absolute one, following symlinks where they exist. */
function resolvePath(ctx: ToolContext, p: string): string {
  const abs = path.resolve(ctx.workspaceRoot, p);
  try {
    return fs.realpathSync(abs);
  } catch {
    // A file about to be created: resolve its parent instead, so a symlinked directory
    // cannot smuggle the write outside the workspace.
    try {
      return path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs));
    } catch {
      return abs;
    }
  }
}

/** What a call would need to be allowed — computed before anything runs. */
export function toGateRequest(ctx: ToolContext, name: string, input: Input): GateRequest | null {
  switch (name) {
    case "search_code":
      return {
        tool: name,
        capability: "file_read",
        // A search reads the whole tree, so it is asked for against the root itself.
        resource: pathToFileURL(ctx.workspaceRoot + path.sep).href,
        summary: `search the workspace for "${input.query}"`,
      };
    case "read_file":
    case "edit_file": {
      const fsPath = resolvePath(ctx, input.path ?? "");
      return {
        tool: name,
        capability: name === "read_file" ? "file_read" : "file_write",
        resource: pathToFileURL(fsPath).href,
        fsPath,
        summary:
          name === "read_file"
            ? `read ${input.path}`
            : `edit ${input.path}: replace ${JSON.stringify(clip(input.old_text, 80))} ` +
              `with ${JSON.stringify(clip(input.new_text, 80))}`,
      };
    }
    case "run_tests":
      return {
        tool: name,
        capability: "code_execution",
        resource: `exec://${path.basename(ctx.testCommand[0] ?? "")}`,
        summary: `run \`${ctx.testCommand.join(" ")}\``,
      };
    default:
      return null;
  }
}

/** Runs an already-authorized call. Errors are returned as text the model can act on. */
export async function execute(ctx: ToolContext, gate: GateRequest, input: Input): Promise<string> {
  switch (gate.tool) {
    case "search_code": {
      try {
        const { stdout } = await run(
          "grep",
          [
            "-rnIF",
            ...["node_modules", "dist", ...FLOOR_DIRS].map((d) => `--exclude-dir=${d}`),
            // The floor applies to search too: a grep over `.env` is a read of `.env`.
            ...FLOOR_FILE_GLOBS.map((g) => `--exclude=${g}`),
            "--",
            input.query,
            ".",
          ],
          { cwd: ctx.workspaceRoot, maxBuffer: 10 * MAX_OUTPUT }
        );
        return clip(stdout, MAX_OUTPUT);
      } catch (err) {
        // grep exits 1 on "no match" — an answer, not a failure.
        if ((err as { code?: number }).code === 1) return `no match for "${input.query}"`;
        throw err;
      }
    }

    case "read_file":
      return clip(fs.readFileSync(gate.fsPath!, "utf8"), MAX_OUTPUT);

    case "edit_file": {
      const file = gate.fsPath!;
      if (input.old_text === "") {
        if (fs.existsSync(file)) return `${input.path} already exists; pass the text to replace.`;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, input.new_text);
        return `created ${input.path}`;
      }
      const current = fs.readFileSync(file, "utf8");
      const count = current.split(input.old_text).length - 1;
      if (count === 0) {
        return `old_text was not found in ${input.path}. Read the file again and copy the exact text, including indentation.`;
      }
      if (count > 1) {
        return `old_text occurs ${count} times in ${input.path}; include more surrounding lines so it is unique.`;
      }
      fs.writeFileSync(file, current.replace(input.old_text, () => input.new_text));
      return `edited ${input.path}`;
    }

    case "run_tests": {
      const [cmd, ...args] = ctx.testCommand;
      try {
        const { stdout, stderr } = await run(cmd!, args, {
          cwd: ctx.workspaceRoot,
          timeout: 5 * 60_000,
          maxBuffer: 10 * MAX_OUTPUT,
        });
        return `exit 0\n${clip(stdout + stderr, MAX_OUTPUT)}`;
      } catch (err) {
        const e = err as { code?: number; stdout?: string; stderr?: string };
        return `exit ${e.code ?? "?"}\n${clip((e.stdout ?? "") + (e.stderr ?? ""), MAX_OUTPUT)}`;
      }
    }

    default:
      throw new Error(`unknown tool ${gate.tool}`);
  }
}

function clip(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : `${s.slice(0, n)}\n… [${s.length - n} more characters]`;
}
