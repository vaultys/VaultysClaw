#!/usr/bin/env node
// SessionStart hook: tell Claude which worktree slot it is in, so it uses this checkout's ports
// and database (scripts/worktree.mjs) instead of the main checkout's 3001 / 8081 / 5433.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { addContext, ROOT } from "./lib.mjs";

const script = join(ROOT, "scripts", "worktree.mjs");
if (!existsSync(script)) process.exit(0);

const res = spawnSync("node", [script, "ports"], { cwd: ROOT, encoding: "utf8" });
const ports = (res.stdout ?? "").trim();
if (res.status !== 0 || !ports) process.exit(0);

const lines = [`VaultysClaw checkout ${ROOT}:`, ports];
if (ports.startsWith("No slot")) {
  lines.push(
    "This git worktree has not been set up: `pnpm controlplane:*` and `pnpm dev` refuse to run until `pnpm worktree:setup` " +
      "gives it its own ports, Docker stack and seeded database. Ask the user before running it (it takes a few minutes)."
  );
} else if (!ports.startsWith("slot 0")) {
  if (!existsSync(join(ROOT, ".worktree", "seeded")))
    lines.push("Its database has not been seeded yet: `pnpm worktree:seed`.");
  lines.push(
    "Run anything that needs these ports or this database through `node scripts/worktree.mjs exec <command>` " +
      "(the `pnpm controlplane:*` scripts already do). Sign in on /login with \"Sign in as the worktree admin\"."
  );
}
addContext("SessionStart", lines.join("\n"));
