import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * The demo-video stack's coordinates. docker/video.env is their single source of truth — the
 * compose project, the control plane (`pnpm video:cp`) and the simulated fleet all read it — so
 * this parses that file rather than writing a port down a second time.
 */
export const REPO = path.resolve(__dirname, "../..");
export const OUTPUT = path.resolve(__dirname, ".generated-videos");

export function parseEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export const STACK = parseEnv(path.join(REPO, "docker/video.env"));
export const BASE_URL = STACK.NEXTAUTH_URL;

/**
 * Where the fleet's identities live. Not the simulator's own `.simdata`: those hold certificates
 * signed by *its* control plane, which this one would reject.
 */
export const SIM_DATA = path.join(OUTPUT, ".simdata");

/** The stack's environment over this process's, for the simulator and the control plane. */
const stackEnv = () => ({ ...process.env, ...STACK });

/**
 * `pnpm simulator <args>` against this stack. Not the root `simulator` script: it sources
 * docker/simulator.env, which would point the fleet back at the simulator's own database.
 */
export function simulator(args: string[]) {
  return execFileSync("pnpm", ["--silent", "--filter", "@vaultysclaw/simulator", "start", ...args, "--data-dir", SIM_DATA], {
    cwd: REPO,
    env: stackEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The same, left running in the background: the fleet stays connected while the video is filmed. */
export function spawnSimulator(args: string[], log: string) {
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const out = fs.openSync(log, "w");
  const child = spawn("pnpm", ["--silent", "--filter", "@vaultysclaw/simulator", "start", ...args, "--data-dir", SIM_DATA], {
    cwd: REPO,
    env: stackEnv(),
    stdio: ["ignore", out, out],
    detached: true,
  });
  child.unref();
  return child;
}
