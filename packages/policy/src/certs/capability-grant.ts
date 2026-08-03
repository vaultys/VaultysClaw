/**
 * Capability request / grant certs (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2).
 *
 * The agent-signed request and the control-plane-signed grant together are the
 * "co-signature" the web-of-trust design calls for, using only the existing
 * generic `signCert`/`openCert` primitive: the grant's signed payload embeds
 * the agent's own signed request verbatim, so anyone holding only the control
 * plane's public key can verify the grant, and anyone who additionally wants
 * to confirm the agent actually asked for exactly these rights can unpack
 * `requestCert` with the agent's public key too.
 */
import type { VaultysId } from "@vaultys/id";
import type { AgentCapability, CertScope, ResourceLimits } from "../types";
import { signCert, openCert } from "./sign";

export interface CapabilityRequestBody {
  type: "capability_request";
  agentDid: string;
  requestedCapabilities: AgentCapability[];
  requestedResourceLimits?: ResourceLimits;
  requestedScope?: CertScope;
  nonce: string;
  issuedAt: number;
}

export interface CapabilityRequestInput {
  agentDid: string;
  requestedCapabilities: AgentCapability[];
  requestedResourceLimits?: ResourceLimits;
  requestedScope?: CertScope;
  nonce: string;
}

/** Sign a capability request with the requesting agent's own VaultysId. */
export function signCapabilityRequestCert(
  vid: VaultysId,
  input: CapabilityRequestInput
): Promise<string> {
  const body: CapabilityRequestBody = {
    type: "capability_request",
    agentDid: input.agentDid,
    requestedCapabilities: input.requestedCapabilities,
    ...(input.requestedResourceLimits !== undefined
      ? { requestedResourceLimits: input.requestedResourceLimits }
      : {}),
    ...(input.requestedScope !== undefined
      ? { requestedScope: input.requestedScope }
      : {}),
    nonce: input.nonce,
    issuedAt: Date.now(),
  };
  return signCert(vid, body);
}

/** Verify a capability-request cert against the requesting agent's public key. */
export function verifyCapabilityRequestCert(
  vid: VaultysId,
  token: string
): CapabilityRequestBody | null {
  const payload = openCert(vid, token) as CapabilityRequestBody | null;
  if (!payload || payload.type !== "capability_request") return null;
  return payload;
}

export interface CapabilityGrantBody {
  type: "capability_grant";
  /** Stable id — this is the `CapabilityCertificate` ledger row's primary key. */
  certId: string;
  agentDid: string;
  workspaceId: string | null;
  grantedCapabilities: AgentCapability[];
  resourceLimits: ResourceLimits | null;
  scope: CertScope | null;
  /** The agent's own signed request, embedded verbatim — the co-signature. */
  requestCert: string;
  issuedAt: number;
  /** Ms since epoch, or null for a certificate that does not auto-expire (rare). */
  expiresAt: number | null;
}

export interface CapabilityGrantInput {
  certId: string;
  agentDid: string;
  workspaceId?: string | null;
  grantedCapabilities: AgentCapability[];
  resourceLimits?: ResourceLimits | null;
  scope?: CertScope | null;
  requestCert: string;
  /** Ms since epoch, or null for a certificate that does not auto-expire. */
  expiresAt: number | null;
}

/** Sign a capability grant with the control plane's VaultysId. */
export function signCapabilityGrantCert(
  vid: VaultysId,
  input: CapabilityGrantInput
): Promise<string> {
  const body: CapabilityGrantBody = {
    type: "capability_grant",
    certId: input.certId,
    agentDid: input.agentDid,
    workspaceId: input.workspaceId ?? null,
    grantedCapabilities: input.grantedCapabilities,
    resourceLimits: input.resourceLimits ?? null,
    scope: input.scope ?? null,
    requestCert: input.requestCert,
    issuedAt: Date.now(),
    expiresAt: input.expiresAt,
  };
  return signCert(vid, body);
}

/**
 * Verify a capability-grant cert against the control plane's public key.
 * Returns the decoded body if the signature is valid and the grant has not
 * expired, else `null`. Does not itself verify the embedded `requestCert` —
 * callers that want the co-signature guarantee call
 * {@link verifyCapabilityRequestCert} on `body.requestCert` with the agent's
 * public key separately.
 */
export function verifyCapabilityGrantCert(
  vid: VaultysId,
  token: string
): CapabilityGrantBody | null {
  const payload = openCert(vid, token) as CapabilityGrantBody | null;
  if (!payload || payload.type !== "capability_grant") return null;
  if (payload.expiresAt !== null && payload.expiresAt < Date.now()) return null;
  return payload;
}
