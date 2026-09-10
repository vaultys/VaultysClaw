/**
 * Local persistence of successful certificate exchanges.
 *
 * Worth persisting because the Challenger certificate is a native, independently
 * verifiable artefact rather than something session-bound: keeping it means a
 * process restart resumes with the same certificates, instead of holding nothing
 * until an admin happens to re-trigger delivery.
 */

import fs from "node:fs";
import path from "node:path";
import { expandHome } from "./identity.js";

export interface CapabilityStateCertificate {
  certId: string;
  certificate: string;
  capabilities: string[];
  /**
   * The status the control plane last reported for this certificate, and when.
   *
   * Absent means "never checked", which is treated as maximally stale rather than as active:
   * assuming active is what made revocation invisible before status checking existed at all.
   */
  lastStatus?: "active" | "revoked" | "superseded" | "expired";
  /** Ms since epoch of the last verified status response. */
  lastCheckedAt?: number;
  issuedAt?: number;
  expiresAt?: number | null;
  resourceLimits?: unknown;
  scope?: unknown;
}

export interface CapabilityState {
  certificates: CapabilityStateCertificate[];
}

/**
 * Read persisted state.
 *
 * Returns `null` for both "no path configured" and "file does not exist yet" —
 * both are the ordinary "nothing granted so far" case, not an error. A malformed
 * file *is* an error: silently discarding it would look identical to a fresh
 * install and quietly drop authority the Actor legitimately holds.
 */
export function loadCapabilityState(statePath?: string): CapabilityState | null {
  if (!statePath) return null;
  const resolved = expandHome(statePath);
  if (!fs.existsSync(resolved)) return null;

  const raw = fs.readFileSync(resolved, "utf-8");
  const parsed = JSON.parse(raw) as CapabilityState;
  if (!parsed || !Array.isArray(parsed.certificates)) {
    throw new Error(`Malformed capability state at ${resolved}`);
  }
  for (const cert of parsed.certificates) {
    if (!cert || typeof cert.certId !== "string" || !Array.isArray(cert.capabilities)) {
      throw new Error(`Malformed capability state at ${resolved}`);
    }
  }
  return parsed;
}

/** Write state with mode 0600, matching the identity secret's permissions. No-op without a path. */
export function saveCapabilityState(statePath: string | undefined, state: CapabilityState): void {
  if (!statePath) return;
  const resolved = expandHome(statePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(resolved, JSON.stringify(state), { encoding: "utf-8", mode: 0o600 });
}
