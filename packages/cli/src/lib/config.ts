/**
 * CLI configuration & local state.
 *
 * Everything lives under ~/.vaultysclaw/ (override with VC_HOME):
 *   config.json          { controlPlaneUrl, session? }
 *   identity.json        the CLI's own VaultysId (base64 secret + did + fingerprint)
 *   agents/<name>.id     base64 secret for each agent provisioned via `agent create`
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CliSession {
  /** Raw Cookie header value captured from the NextAuth sign-in. */
  cookie: string;
  did: string | null;
  name?: string | null;
}

export interface CliConfig {
  controlPlaneUrl: string;
  session?: CliSession;
}

const DEFAULT_CONTROL_PLANE_URL = "http://localhost:3000";

export function configDir(): string {
  return process.env.VC_HOME || path.join(os.homedir(), ".vaultysclaw");
}

function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function identityPath(): string {
  return path.join(configDir(), "identity.json");
}

export function agentIdPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(configDir(), "agents", `${safe}.id`);
}

function ensureDir(p: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

export function loadConfig(): CliConfig {
  let cfg: CliConfig = { controlPlaneUrl: DEFAULT_CONTROL_PLANE_URL };
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    cfg = { ...cfg, ...(JSON.parse(raw) as Partial<CliConfig>) };
  } catch {
    /* no config yet — use defaults */
  }
  // Environment always wins so the same config can target multiple deployments.
  if (process.env.VC_CONTROL_PLANE_URL) {
    cfg.controlPlaneUrl = process.env.VC_CONTROL_PLANE_URL;
  }
  cfg.controlPlaneUrl = cfg.controlPlaneUrl.replace(/\/$/, "");
  return cfg;
}

export function saveConfig(cfg: CliConfig): void {
  ensureDir(configPath());
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf-8");
}

export function clearSession(): void {
  const cfg = loadConfig();
  delete cfg.session;
  saveConfig(cfg);
}

export function requireSession(cfg: CliConfig): CliSession {
  if (!cfg.session?.cookie) {
    throw new Error('Not logged in. Run "vaultysclaw login" first.');
  }
  return cfg.session;
}
