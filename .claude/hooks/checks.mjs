#!/usr/bin/env node
// Stop hook: before Claude ends its turn, check what its uncommitted changes touch.
//
//   changed workspace package   → its type-check and its tests
//   …and every package depending on it (transitively) → type-check
//   policy / trust / shared / sdk changed → rebuilt first (dependents import their dist/ at runtime)
//   conformance/                → policy + trust tests and `go test` in sdk-go (both halves of the contract)
//   sdk-go/ or vaultysclaw-sensor/ → `go test ./...` there
//
// No lint (type-check is the gate here). A failure is sent back to Claude (exit 2) to fix.
// "Changed" = the working tree against HEAD, tracked and untracked, so edits made through Bash
// count too; a turn that changed no code costs one `git diff`. The fingerprint of the last green
// state is kept in .claude/.hook-state/, so an unchanged tree is not checked twice.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readInput, ROOT, STATE_DIR } from "./lib.mjs";

const GREEN_FILE = join(STATE_DIR, "checks.green");
const FAILED_FILE = join(STATE_DIR, "checks.failed");
const LOG_FILE = join(STATE_DIR, "checks.log");
const CODE = /\.(tsx?|mts|cts|mjs|cjs|jsx?|json|prisma|go|mod|sum|ya?ml)$/;
const LIBS = ["policy", "trust", "shared", "sdk"];

const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).stdout ?? "";
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim() : "");

const input = readInput();

const files = [
  ...git("diff", "HEAD", "--name-only").split("\n"),
  ...git("ls-files", "--others", "--exclude-standard").split("\n"),
].filter((f) => f && CODE.test(f) && !f.startsWith(".claude/"));
if (files.length === 0) process.exit(0);

const hash = createHash("sha256").update(git("rev-parse", "HEAD")).update(git("diff", "HEAD", "--", ...files));
for (const f of files) if (existsSync(join(ROOT, f))) hash.update(f).update(readFileSync(join(ROOT, f)));
const fingerprint = hash.digest("hex");
if (fingerprint === read(GREEN_FILE)) process.exit(0);
// Already reported this exact state and Claude stopped again without changing anything: let it stop.
if (input.stop_hook_active && fingerprint === read(FAILED_FILE)) process.exit(0);

// ── What to run ──────────────────────────────────────────────────────────────────────────────

/** dir → { name, scripts, deps } for every workspace package. */
const pkgs = new Map();
for (const dir of readdirSync(join(ROOT, "packages"))) {
  const file = join(ROOT, "packages", dir, "package.json");
  if (!existsSync(file)) continue;
  const p = JSON.parse(readFileSync(file, "utf8"));
  const deps = Object.keys({ ...p.dependencies, ...p.devDependencies }).filter((d) => d.startsWith("@vaultysclaw/"));
  pkgs.set(dir, { name: p.name, scripts: p.scripts ?? {}, deps });
}
const dirOf = (name) => [...pkgs].find(([, p]) => p.name === name)?.[0];

const changed = new Set();
const goModules = new Set();
for (const f of files) {
  const [top, dir] = f.split("/");
  if (top === "packages" && pkgs.has(dir)) changed.add(dir);
  else if (top === "conformance") {
    changed.add("policy");
    changed.add("trust");
    goModules.add("sdk-go");
  } else if (top === "sdk-go" || top === "vaultysclaw-sensor") goModules.add(top);
}

// Type-check the changed packages and everything that depends on them: their types come from src/.
const typeCheck = new Set(changed);
for (let grew = true; grew; ) {
  grew = false;
  for (const [dir, p] of pkgs)
    if (!typeCheck.has(dir) && p.deps.some((d) => typeCheck.has(dirOf(d)))) {
      typeCheck.add(dir);
      grew = true;
    }
}

const steps = [];
const builds = LIBS.filter((l) => changed.has(l));
if (builds.length)
  steps.push(["build " + builds.join(", "), "pnpm", ["exec", "turbo", "run", "build", ...builds.map((l) => `--filter=@vaultysclaw/${l}`)]]);
if (typeCheck.has("webhook-dispatcher"))
  steps.push(["dispatcher Prisma client", "pnpm", ["controlplane:webhook:prisma"]]);
for (const dir of typeCheck)
  if (pkgs.get(dir).scripts["type-check"]) steps.push([`type-check ${dir}`, "pnpm", ["--filter", pkgs.get(dir).name, "run", "type-check"]]);
for (const dir of changed)
  if (pkgs.get(dir)?.scripts.test) steps.push([`test ${dir}`, "pnpm", ["--filter", pkgs.get(dir).name, "run", "test"]]);
const hasGo = spawnSync("go", ["version"], { stdio: "ignore" }).status === 0;
for (const mod of goModules) if (hasGo) steps.push([`go test ${mod}`, "go", ["test", "./..."], join(ROOT, mod)]);

if (steps.length === 0) process.exit(0);

// ── Run ──────────────────────────────────────────────────────────────────────────────────────

mkdirSync(STATE_DIR, { recursive: true });
let log = "";
const failures = [];
for (const [label, cmd, args, cwd = ROOT] of steps) {
  const res = spawnSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  log += `\n===== ${label} (exit ${res.status}) =====\n${out}`;
  if (res.status !== 0) {
    failures.push({ label, out });
    // A failed build makes everything after it fail for the wrong reason.
    if (label.startsWith("build ")) break;
  }
}
writeFileSync(LOG_FILE, log);

const ran = steps.map(([label]) => label).join(", ");
const goNote = goModules.size && !hasGo ? " — Go not installed, `go test` skipped" : "";
if (failures.length === 0) {
  writeFileSync(GREEN_FILE, fingerprint);
  console.log(JSON.stringify({ systemMessage: `checks green: ${ran}${goNote}` }));
  process.exit(0);
}

writeFileSync(FAILED_FILE, fingerprint);
process.stderr.write(
  `Checks failed: ${failures.map((f) => f.label).join(", ")}. Fix them before finishing ` +
    `(full log: .claude/.hook-state/checks.log).\n` +
    failures.map((f) => `\n── ${f.label} ──\n${f.out.split("\n").slice(-80).join("\n")}`).join("\n") +
    "\n"
);
process.exit(2);
