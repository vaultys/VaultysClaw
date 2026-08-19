/**
 * Actor identity: load an existing VaultysId from disk, or create one on first
 * run.
 *
 * The file format is the bare base64 secret and nothing else — no JSON wrapper,
 * matching `packages/agent-runtime` and the Go SDK's `identity` package, so the
 * same file works across all three.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { VaultysId } from "@vaultys/id";

/** Expand a leading `~` — config files and CLI flags routinely contain one. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Load the identity at `identityPath`, generating and persisting one if the file
 * does not exist.
 *
 * Always returns a version-1 id: every signature path in this system pins
 * `toVersion(1)`, and mixing versions produces handshake failures that look like
 * key mismatches.
 *
 * The secret is written with mode 0600. Losing this file means losing the DID —
 * the Actor would register as a brand new one, needing approval again.
 */
export async function loadOrCreateIdentity(identityPath: string): Promise<VaultysId> {
  const resolved = expandHome(identityPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  if (fs.existsSync(resolved)) {
    const secret = fs.readFileSync(resolved, "utf-8").trim();
    return VaultysId.fromSecret(secret, "base64").toVersion(1);
  }

  const generated = (await VaultysId.generateMachine()).toVersion(1);
  fs.writeFileSync(resolved, generated.getSecret("base64"), { encoding: "utf-8", mode: 0o600 });
  return generated;
}
