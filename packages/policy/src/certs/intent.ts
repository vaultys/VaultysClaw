/**
 * Intent-signature certs.
 *
 * The control plane signs every intent it dispatches so the receiving agent can
 * verify it originated from the legitimate server (not a spoofed WS peer). The
 * same token is also re-verified server-side for non-repudiable audit records.
 */
import type { VaultysId } from "@vaultys/id";
import { signCert, openCert } from "./sign";

export interface IntentCertBody {
  type: "intent";
  id: string;
  action: string;
  agentId: string;
  timestamp: number;
}

/** Fields that identify the intent being signed. */
export interface IntentCertInput {
  id: string;
  action: string;
  agentId: string;
}

/** Optional cross-checks applied to the decoded body during verification. */
export interface IntentCertExpectation {
  intentId?: string;
  action?: string;
  agentId?: string | null;
}

/** Sign an intent dispatch with the server's VaultysId. */
export function signIntentCert(
  vid: VaultysId,
  input: IntentCertInput
): Promise<string> {
  const body: IntentCertBody = {
    type: "intent",
    id: input.id,
    action: input.action,
    agentId: input.agentId,
    timestamp: Date.now(),
  };
  return signCert(vid, body);
}

/**
 * Verify an intent cert token and optionally cross-check its body against the
 * expected intent id / action / agent (so a signature lifted from another
 * record can't be replayed). Returns the decoded body if valid, else `null`.
 */
export function verifyIntentCert(
  vid: VaultysId,
  token: string,
  expected?: IntentCertExpectation
): IntentCertBody | null {
  const payload = openCert(vid, token) as IntentCertBody | null;
  if (!payload || payload.type !== "intent") return null;
  if (expected?.intentId && payload.id !== expected.intentId) return null;
  if (expected?.action && payload.action !== expected.action) return null;
  if (
    expected?.agentId !== undefined &&
    expected.agentId !== null &&
    payload.agentId !== expected.agentId
  )
    return null;
  return payload;
}
