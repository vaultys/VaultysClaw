/**
 * Decode + independently re-verify a certificate for the detail page
 * (docs/PAGE_DESIGN.md §1.5's signature-chain view) — audit/display only,
 * never used for an authorization decision (that's `packages/trust`'s job
 * over already-persisted ledger state).
 *
 * Branches on `certFormat` (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2a vs §3.2b):
 * "packcert" rows are two nested `packages/policy` tokens (grant + embedded
 * request) verified independently; "challenger" rows are the library's
 * native dual-signature `Challenger` certificate — there is no separate
 * embedded request token to inspect, the co-signature is already native.
 */
import { Challenger, VaultysId } from "@vaultys/id";
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
   * the literal signed artifact, `decoded` is it made human-readable. Null
   * for "challenger" rows — the dual-signature format has no single
   * "signed body" segment separate from its fields (see `decoded` instead).
   */
  signedBodyBase64: string | null;
  /** Base64 of the raw signature bytes, plus their length for a quick sanity check. */
  signatureBase64: string | null;
  signatureByteLength: number | null;
}

export type VerifiedBy = "control-plane" | "actor" | null;

export interface InspectedCertificate {
  certFormat: "packcert" | "challenger";
  grant: DecodedToken;
  grantVerified: boolean;
  /** Null for "challenger" rows — no separate embedded request token exists (the dual signature is native). */
  request: DecodedToken | null;
  /** Which key actually verifies the embedded request — the co-signature audit signal
   *  (trust doc §3.2a): "control-plane" means this was a system/admin-issued grant, nobody
   *  outside asked for it; "actor" means the agent itself signed the request. */
  requestVerifiedBy: VerifiedBy;
}

function decodePackcertToken(token: string): DecodedToken {
  const parts = unpackCert(token);
  return {
    raw: token,
    decoded: decodeCertUnsafe(token),
    signedBodyBase64: parts ? Buffer.from(parts.body).toString("base64") : null,
    signatureBase64: parts ? Buffer.from(parts.signature).toString("base64") : null,
    signatureByteLength: parts ? parts.signature.length : null,
  };
}

function decodeChallengerToken(certificateBase64: string): DecodedToken {
  try {
    const bytes = Buffer.from(certificateBase64, "base64");
    const parsed = Challenger.deserializeCertificate(bytes as never);
    const sign2 = parsed.sign2 ? Buffer.from(parsed.sign2) : null;
    const sign1 = parsed.sign1 ? Buffer.from(parsed.sign1) : null;
    // sign2 is the counterpart's (the Actor's) final signature — the one that makes this
    // interactive/co-signed rather than unilaterally issued; fall back to sign1 for a
    // certificate captured mid-handshake (shouldn't happen for a persisted row, but cheap to guard).
    const signature = sign2 ?? sign1;
    return {
      raw: certificateBase64,
      decoded: {
        version: parsed.version,
        protocol: parsed.protocol,
        service: parsed.service,
        timestamp: parsed.timestamp,
        pk1: parsed.pk1 ? Buffer.from(parsed.pk1).toString("base64") : undefined,
        pk2: parsed.pk2 ? Buffer.from(parsed.pk2).toString("base64") : undefined,
        nonce: parsed.nonce ? Buffer.from(parsed.nonce).toString("base64") : undefined,
        sign1: sign1 ? sign1.toString("base64") : undefined,
        sign2: sign2 ? sign2.toString("base64") : undefined,
        metadata: parsed.metadata,
      },
      signedBodyBase64: null,
      signatureBase64: signature ? signature.toString("base64") : null,
      signatureByteLength: signature ? signature.length : null,
    };
  } catch {
    return { raw: certificateBase64, decoded: null, signedBodyBase64: null, signatureBase64: null, signatureByteLength: null };
  }
}

async function inspectPackcert(
  certificate: string,
  requestCertificate: string | null,
  actorPublicKeyBase64: string | null
): Promise<InspectedCertificate> {
  const serverVid = await ServerIdentityDAO.getServerVaultysId();
  const grantVerified = verifyCapabilityGrantCert(serverVid, certificate) !== null;

  const requestToken = requestCertificate ?? "";
  let requestVerifiedBy: VerifiedBy = null;
  if (actorPublicKeyBase64) {
    const actorVid = VaultysId.fromId(
      Buffer.from(actorPublicKeyBase64, "base64") as never
    ).toVersion(1);
    if (verifyCapabilityRequestCert(actorVid, requestToken) !== null) {
      requestVerifiedBy = "actor";
    }
  }
  if (!requestVerifiedBy && verifyCapabilityRequestCert(serverVid, requestToken) !== null) {
    requestVerifiedBy = "control-plane";
  }

  return {
    certFormat: "packcert",
    grant: decodePackcertToken(certificate),
    grantVerified,
    request: decodePackcertToken(requestToken),
    requestVerifiedBy,
  };
}

async function inspectChallenger(certificate: string): Promise<InspectedCertificate> {
  const bytes = Buffer.from(certificate, "base64");
  let grantVerified = false;
  try {
    grantVerified = await Challenger.verifyCertificate(bytes as never);
  } catch {
    grantVerified = false;
  }
  return {
    certFormat: "challenger",
    grant: decodeChallengerToken(certificate),
    grantVerified,
    request: null,
    requestVerifiedBy: null,
  };
}

export async function inspectCertificate(
  certFormat: "packcert" | "challenger",
  certificate: string,
  requestCertificate: string | null,
  actorPublicKeyBase64: string | null
): Promise<InspectedCertificate> {
  if (certFormat === "challenger") return inspectChallenger(certificate);
  return inspectPackcert(certificate, requestCertificate, actorPublicKeyBase64);
}
