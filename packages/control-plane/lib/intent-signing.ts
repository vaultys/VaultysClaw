/**
 * Intent signing utilities (control-plane side).
 *
 * The control plane signs every intent it dispatches so the receiving agent
 * can verify it originated from the legitimate server (not a spoofed WS peer).
 *
 * This module is a thin, DB-aware wrapper around the shared cert primitives in
 * `@vaultysclaw/policy`: it resolves the server identity from the stored
 * `serverSecret` and delegates the actual signing/verification to the engine.
 */

import { VaultysId } from "@vaultys/id";
import { SettingsDAO } from "@/db";
import pino from "pino";
import {
  signIntentCert,
  verifyIntentCert,
  type IntentCertBody,
  type IntentCertExpectation,
} from "@vaultysclaw/policy";

const logger = pino();

/** @deprecated Prefer importing `IntentCertBody` from `@vaultysclaw/policy`. */
export type IntentSigningBody = IntentCertBody;

/**
 * Sign an intent dispatch with the server's VaultysId.
 * Returns base64 token on success, null if the server identity is missing or
 * signing fails (non-fatal — the intent is still sent, just unsigned).
 */
export async function signIntent(
  intentId: string,
  action: string,
  agentId: string
): Promise<string | null> {
  try {
    const serverSecret = await SettingsDAO.get("serverSecret");
    if (!serverSecret) return null;

    const vid = VaultysId.fromSecret(serverSecret, "base64");
    return await signIntentCert(vid, { id: intentId, action, agentId });
  } catch (err) {
    logger.warn({ err }, "Failed to sign intent (non-fatal)");
    return null;
  }
}

/**
 * Verify a base64 audit signature produced by {@link signIntent} against the
 * server's own VaultysId (re-derived from the stored `serverSecret`).
 *
 * Used by `GET /api/intents` to prove each audit record is non-repudiable.
 * Optionally cross-checks the signed body against the expected intent id /
 * action / agent so a signature lifted from another record can't be replayed.
 *
 * Returns `true` only if the signature is valid and (when provided) the body
 * matches; `false` on any decode/verify failure or missing server identity.
 */
export async function verifyIntentSignature(
  signature: string | null | undefined,
  expected?: IntentCertExpectation
): Promise<boolean> {
  if (!signature) return false;
  try {
    const serverSecret = await SettingsDAO.get("serverSecret");
    if (!serverSecret) return false;
    const vid = VaultysId.fromSecret(serverSecret, "base64");

    return verifyIntentCert(vid, signature, expected) !== null;
  } catch (err) {
    logger.warn({ err }, "Failed to verify intent signature");
    return false;
  }
}
