// Shared plumbing for the Claude Code hooks in this directory (wired in ../settings.json).

import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Git-ignored (/.claude/* in .gitignore): hook bookkeeping and the last test logs. */
export const STATE_DIR = join(ROOT, ".claude", ".hook-state");

/** The hook's JSON input (stdin). */
export function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/** The repo-relative, slash-separated path a file tool is acting on, or null. */
export function toolFile(input) {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? input.tool_response?.filePath;
  if (!file) return null;
  const rel = relative(ROOT, file).split(sep).join("/");
  return rel.startsWith("../") ? null : rel;
}

/** PreToolUse: "ask" the user or "deny" outright, with the reason shown to both the user and Claude. */
export function decide(decision, reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason },
    })
  );
  process.exit(0);
}

/** Extra context handed to Claude after a tool ran (PostToolUse) or when a session starts (SessionStart). */
export function addContext(hookEventName, text) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: text } }));
  process.exit(0);
}
