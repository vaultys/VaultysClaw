/**
 * Generic sign / verify over the {@link packCert} envelope.
 *
 * These helpers know nothing about specific payload shapes — the typed wrappers
 * (`intent.ts`, `delegation.ts`, `peer-grant.ts`) layer meaning on top.
 *
 * Callers supply a `VaultysId`:
 *   - to sign, construct it from the server secret (`VaultysId.fromSecret`);
 *   - to verify, construct it from the signer's public key bytes
 *     (`VaultysId.fromId`) or from the server secret for self-verification.
 */
import type { VaultysId } from "@vaultys/id";
import { crypto } from "@vaultys/id";
import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import { packCert, unpackCert } from "./codec";

const Buf = crypto.Buffer;

/**
 * msgpack-encode `payload`, sign it with `vid`, and return the base64 cert token.
 */
export async function signCert(
  vid: VaultysId,
  payload: unknown
): Promise<string> {
  const body = Buf.from(msgpackEncode(payload));
  const signature = await vid.signChallenge(body);
  return packCert(body, Buf.from(signature));
}

/**
 * Verify a cert token's signature against `vid` and return its decoded payload.
 * Returns `null` on any malformed token, signature mismatch, or decode failure.
 *
 * The caller is responsible for validating the decoded shape (e.g. checking
 * `type` and expiry) — the typed wrappers do this.
 */
export function openCert(vid: VaultysId, token: string): unknown | null {
  try {
    const parts = unpackCert(token);
    if (!parts) return null;

    const valid = vid.verifyChallenge(
      Buf.from(parts.body),
      Buf.from(parts.signature),
      false
    );
    if (!valid) return null;

    return msgpackDecode(parts.body);
  } catch {
    return null;
  }
}
