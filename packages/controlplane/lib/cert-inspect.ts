/**
 * Decode + independently re-verify a certificate for the detail page
 * (docs/PAGE_DESIGN.md §1.5's signature-chain view) — audit/display only,
 * never used for an authorization decision (that's `packages/trust`'s job
 * over already-persisted ledger state).
 */
import { VaultysId } from "@vaultys/id";
import {
  decodeCertUnsafe,
  verifyCapabilityGrantCert,
  verifyCapabilityRequestCert,
} from "@vaultysclaw/policy";
import { ServerIdentityDAO } from "@/db";

export interface DecodedToken {
  raw: string;
  decoded: unknown;
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
    grant: { raw: certificate, decoded: decodeCertUnsafe(certificate) },
    grantVerified,
    request: { raw: requestCertificate, decoded: decodeCertUnsafe(requestCertificate) },
    requestVerifiedBy,
  };
}
