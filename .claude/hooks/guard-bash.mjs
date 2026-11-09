#!/usr/bin/env node
// PreToolUse hook (Bash): make the user confirm commands that are hard to undo here — rewriting
// or pushing straight to main, wiping a database or a worktree's Docker stack, and touching the
// git stash, which every worktree of this repo (and every agent working in one) shares.
// "ask", not "deny": the user may well want it.

import { decide, readInput } from "./lib.mjs";

const RULES = [
  [/\bgit\s+push\b.*(\s--force\b|\s--force-with-lease\b|\s-f\b|\s\+\S)/, "force-pushes, rewriting the remote history"],
  [/\bgit\s+push\b.*\s(origin\s+)?(HEAD:)?(refs\/heads\/)?main\b/, "pushes straight to main"],
  [/\bgit\s+reset\b.*--hard\b/, "discards uncommitted changes"],
  [/\bgit\s+clean\b.*\s-[a-zA-Z]*f/, "deletes untracked files"],
  [
    /\bgit\s+stash\s*$|\bgit\s+stash\s+(pop|drop|clear)\b/,
    "uses the git stash, which is shared by every worktree and agent of this repo — a bare stash/pop can take someone else's changes. " +
      "Prefer a WIP commit, or `git stash push -m <tag>` then `git stash apply <sha>`",
  ],
  [/\bprisma\s+migrate\s+reset\b/, "drops and recreates the database (all data lost)"],
  [/\bprisma\s+db\s+push\b.*--(force-reset|accept-data-loss)\b/, "may drop data to match the schema"],
  [/\bdocker\s+compose\b.*\bdown\b.*(\s-v\b|--volumes\b)/, "removes the containers and their volumes (database data)"],
  [/\bdocker\s+(volume\s+(rm|prune)|system\s+prune)\b/, "deletes Docker volumes (database data)"],
  [/\bdocker\s+(container\s+)?(rm|kill|stop)\b.*\b(postgres|redis)\b/, "stops or removes a Postgres/Redis container other projects or worktrees may use"],
  [/\bworktree:teardown\b|\bworktree\.mjs\s+teardown\b/, "deletes this worktree's Docker stack and its seeded database"],
  [/\b(simulator|video):nuke\b/, "deletes that stack's database volume"],
  [/\bsimulator\s+reset\b/, "removes every simulated Actor, person and registration from the simulator database"],
];

const command = readInput().tool_input?.command ?? "";

// Look at each simple command on its own, without the content of quoted strings, so a commit
// message or an echo that mentions "main" or "reset" does not trigger anything.
const segments = command.replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""').split(/&&|\|\||[;|\n]/);

for (const segment of segments)
  for (const [pattern, why] of RULES)
    if (pattern.test(segment)) decide("ask", `This command ${why}: \`${segment.trim()}\``);
