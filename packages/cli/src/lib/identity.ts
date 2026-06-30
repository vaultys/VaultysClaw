/**
 * VaultysId identity helpers for the CLI.
 *
 * The CLI carries its own distinct VaultysId (the "passport"); each agent
 * provisioned with `agent create` also gets its own freshly generated keypair,
 * stored locally so it can later run as an agent-controller with that identity.
 */

import fs from "node:fs";
import path from "node:path";
import { VaultysId, crypto } from "@vaultys/id";
import { agentIdPath, identityPath } from "./config.js";

const Buf = crypto.Buffer;

export interface Identity {
  /** base64-encoded VaultysId secret. */
  secret: string;
  did: string;
  fingerprint: string;
  /** base64-encoded public key (the `id` bytes). */
  publicKey: string;
}

/** Short, human-friendly identity label, e.g. `vid_3f9a…c21`. */
export function vidLabel(fingerprint: string): string {
  const hex = fingerprint.replace(/[^a-zA-Z0-9]/g, "");
  if (hex.length <= 7) return `vid_${hex}`;
  return `vid_${hex.slice(0, 4)}…${hex.slice(-3)}`;
}

function toIdentity(vid: VaultysId): Identity {
  return {
    secret: vid.getSecret("base64") as string,
    did: vid.did,
    fingerprint: vid.fingerprint,
    publicKey: Buf.from(vid.id).toString("base64"),
  };
}

export async function generateIdentity(): Promise<Identity> {
  const vid = (await VaultysId.generateMachine()).toVersion(1);
  return toIdentity(vid);
}

export function loadVaultysId(secret: string): VaultysId {
  return VaultysId.fromSecret(secret, "base64").toVersion(1);
}

function ensureDir(p: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

/** Load the CLI's own identity, creating and persisting one if absent. */
export async function loadOrCreateCliIdentity(): Promise<Identity> {
  try {
    const raw = fs.readFileSync(identityPath(), "utf-8");
    return JSON.parse(raw) as Identity;
  } catch {
    const id = await generateIdentity();
    ensureDir(identityPath());
    fs.writeFileSync(identityPath(), JSON.stringify(id, null, 2), "utf-8");
    return id;
  }
}

export function loadCliIdentity(): Identity | null {
  try {
    return JSON.parse(fs.readFileSync(identityPath(), "utf-8")) as Identity;
  } catch {
    return null;
  }
}

/** Generate a fresh agent identity and persist its secret under agents/<name>.id. */
export async function createAgentIdentity(name: string): Promise<Identity> {
  const id = await generateIdentity();
  const p = agentIdPath(name);
  ensureDir(p);
  fs.writeFileSync(p, id.secret, "utf-8");
  return id;
}
