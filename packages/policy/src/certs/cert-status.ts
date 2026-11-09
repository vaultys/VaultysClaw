/**
 * Certificate status-check certs — the "OCSP of VaultysClaw"
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §4.1).
 *
 * The request is signed by whoever is asking (an agent, a verifier, a human
 * session) so a status check is itself attributable. The response is signed
 * by the control plane, not just returned over an authenticated transport —
 * so it can be cached, stapled, or forwarded (docs §5) and still be
 * independently verified by whoever eventually relies on it.
 */
import type { VaultysId } from "@vaultys/id";
import type { AgentCapability, CertScope, ResourceLimits } from "../types";
import { signCert, openCert } from "./sign";

export type CertificateStatus = "active" | "revoked" | "superseded" | "expired";

export interface CertStatusRequestBody {
  type: "cert_status_request";
  certId: string;
  requesterDid: string;
  nonce: string;
  issuedAt: number;
}

export interface CertStatusRequestInput {
  certId: string;
  requesterDid: string;
  nonce: string;
}

export function signCertStatusRequestCert(
  vid: VaultysId,
  input: CertStatusRequestInput
): Promise<string> {
  const body: CertStatusRequestBody = {
    type: "cert_status_request",
    certId: input.certId,
    requesterDid: input.requesterDid,
    nonce: input.nonce,
    issuedAt: Date.now(),
  };
  return signCert(vid, body);
}

export function verifyCertStatusRequestCert(
  vid: VaultysId,
  token: string
): CertStatusRequestBody | null {
  const payload = openCert(vid, token) as CertStatusRequestBody | null;
  if (!payload || payload.type !== "cert_status_request") return null;
  return payload;
}

export interface CertStatusResponseBody {
  type: "cert_status_response";
  certId: string;
  agentDid: string;
  status: CertificateStatus;
  capabilities: AgentCapability[];
  resourceLimits: ResourceLimits | null;
  scope: CertScope | null;
  checkedAt: number;
  /** Ms since epoch, or null for a certificate that does not auto-expire. */
  expiresAt: number | null;
  /**
   * The DID this assertion was issued *to* — the requester of a status check, or the Actor an
   * `actor_config`/`grant_status` push was addressed to. Null when unaddressed.
   *
   * Signed so a holder can refuse an assertion minted for somebody else: a status response is
   * designed to be cached and forwarded, and without an audience one Actor's "active" could be
   * replayed to back another Actor's decision.
   *
   * Optional in the type because a response signed before this field existed decodes without it.
   */
  aud?: string | null;
  /**
   * Monotonic ordering of assertions from the issuing control plane. A recipient keeps the highest
   * it has seen per certificate and refuses a lower one, so an older "active" cannot be replayed
   * over a newer "revoked". Never decreases across restarts of a single control plane (it is
   * clock-derived, see the control plane's `nextStatusSeq`). Optional for the same reason as
   * {@link aud}; a recipient should fall back to `checkedAt`.
   */
  seq?: number;
}

export interface CertStatusResponseInput {
  certId: string;
  agentDid: string;
  status: CertificateStatus;
  capabilities: AgentCapability[];
  resourceLimits?: ResourceLimits | null;
  scope?: CertScope | null;
  expiresAt: number | null;
  /** See {@link CertStatusResponseBody.aud}. */
  aud?: string | null;
  /** See {@link CertStatusResponseBody.seq}. Defaults to `checkedAt`. */
  seq?: number;
  /** Injected clock, ms since epoch. Defaults to `Date.now()`. */
  now?: number;
}

/** Sign a status response with the control plane's VaultysId. */
export function signCertStatusResponseCert(
  vid: VaultysId,
  input: CertStatusResponseInput
): Promise<string> {
  const checkedAt = input.now ?? Date.now();
  const body: CertStatusResponseBody = {
    type: "cert_status_response",
    certId: input.certId,
    agentDid: input.agentDid,
    status: input.status,
    capabilities: input.capabilities,
    resourceLimits: input.resourceLimits ?? null,
    scope: input.scope ?? null,
    checkedAt,
    expiresAt: input.expiresAt,
    aud: input.aud ?? null,
    seq: input.seq ?? checkedAt,
  };
  return signCert(vid, body);
}

/**
 * Verify a status-response cert against the control plane's public key.
 * `maxAgeMs`, if given, rejects a response older than that — the knob a
 * stapling verifier uses to enforce `stapleTtlSeconds` (docs §5.2).
 */
export function verifyCertStatusResponseCert(
  vid: VaultysId,
  token: string,
  maxAgeMs?: number
): CertStatusResponseBody | null {
  const payload = openCert(vid, token) as CertStatusResponseBody | null;
  if (!payload || payload.type !== "cert_status_response") return null;
  if (maxAgeMs !== undefined && Date.now() - payload.checkedAt > maxAgeMs) {
    return null;
  }
  return payload;
}
