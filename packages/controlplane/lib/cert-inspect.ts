/**
 * Decode + independently re-verify a certificate for the detail page
 * (docs/PAGE_DESIGN.md §1.5's signature-chain view) — audit/display only,
 * never used for an authorization decision (that's `packages/trust`'s job
 * over already-persisted ledger state).
 */
import { VaultysId } from "@vaultys/id";
import {
  decodeCertUnsafe,
  unpackCert,
  verifyCapabilityGrantCert,
  verifyCapabilityRequestCert,
} from "@vaultysclaw/policy";
import { ServerIdentityDAO } from "@/db";

export interface DecodedToken {
  raw: string;
  decoded: unknown;
  /**
   * Base64 of the exact bytes the signature covers — `packCert`'s
   * `msgpack(body)` segment, i.e. what you'd feed back into a signature
   * verifier alongside the signature below. Distinct from `decoded`: this is
   * the literal signed artifact, `decoded` is it made human-readable.
   */
  signedBodyBase64: string | null;
  /** Base64 of the raw signature bytes, plus their length for a quick sanity check. */
  signatureBase64: string | null;
  signatureByteLength: number | null;
}

export type VerifiedBy = "control-plane" | "principal" | null;

export interface InspectedCertificate {
  grant: DecodedToken;
  grantVerified: boolean;
  request: DecodedToken;
  /** Which key actually verifies the embedded request — the co-signature audit signal
   *  (trust doc §3.2): "control-plane" means this was a system/admin-issued grant, nobody
   *  outside asked for it; "principal" means the agent itself signed the request. */
  requestVerifiedBy: VerifiedBy;
}

function decodeToken(token: string): DecodedToken {
  const parts = unpackCert(token);
  return {
    raw: token,
    decoded: decodeCertUnsafe(token),
    signedBodyBase64: parts ? Buffer.from(parts.body).toString("base64") : null,
    signatureBase64: parts ? Buffer.from(parts.signature).toString("base64") : null,
    signatureByteLength: parts ? parts.signature.length : null,
  };
}

export async function inspectCertificate(
  certificate: string,
  requestCertificate: string,
  principalPublicKeyBase64: string | null
): Promise<InspectedCertificate> {
  const serverVid = await ServerIdentityDAO.getServerVaultysId();

  const grantVerified = verifyCapabilityGrantCert(serverVid, certificate) !== null;

  let requestVerifiedBy: VerifiedBy = null;
  if (principalPublicKeyBase64) {
    const principalVid = VaultysId.fromId(
      Buffer.from(principalPublicKeyBase64, "base64") as never
    ).toVersion(1);
    if (verifyCapabilityRequestCert(principalVid, requestCertificate) !== null) {
      requestVerifiedBy = "principal";
    }
  }
  if (!requestVerifiedBy && verifyCapabilityRequestCert(serverVid, requestCertificate) !== null) {
    requestVerifiedBy = "control-plane";
  }

  return {
    grant: decodeToken(certificate),
    grantVerified,
    request: decodeToken(requestCertificate),
    requestVerifiedBy,
  };
}
