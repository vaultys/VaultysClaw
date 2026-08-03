/**
 * Trust ledger types.
 *
 * `CapabilityCertificateLite` is deliberately a *subset* of the full
 * `CapabilityCertificate` Prisma row (docs/CERTIFICATE_WEB_OF_TRUST.md §3.3) — only the
 * fields `resolvePermission` actually needs to decide an action, so control-plane's
 * DB-aware wrapper can pass rows straight through without reshaping them, and
 * `agent-runtime` can construct the same shape locally from a decoded cert payload
 * with no DB in the loop.
 */
import type { AgentCapability, CertScope, ResourceLimits } from "@vaultysclaw/policy";
import type { CertificateStatus } from "@vaultysclaw/policy";

// `CertScope` and `CertificateStatus` are defined in `@vaultysclaw/policy` (the wire-format
// package — `CertScope` is embedded in the signed `capability_grant`/`cert_status_response`
// payloads) and re-exported here so consumers of `@vaultysclaw/trust` don't also need to
// import `@vaultysclaw/policy` directly for these two types.
export type { CertScope, CertificateStatus };

/** The minimal certificate shape `resolvePermission` and `isEligibleForProactiveRenewal` need. */
export interface CapabilityCertificateLite {
  id: string;
  agentDid: string;
  capabilities: AgentCapability[];
  resourceLimits?: ResourceLimits | null;
  scope?: CertScope | null;
  status: CertificateStatus;
  /** Ms since epoch. */
  issuedAt: number;
  /** Ms since epoch, or null for a certificate that does not auto-expire (rare — trust doc §3.3). */
  expiresAt: number | null;
  /** How many times this certificate's `scope.maxUses` has already been consumed. */
  usedCount?: number;
}

/** An action being evaluated against a Principal's currently held certificates. */
export interface RequestedAction {
  capability: AgentCapability;
  /** The resource the action targets, if any — required to match a scoped certificate. */
  resource?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  /** The certificate that authorized the action, when `allowed` is true. */
  grantingCertId?: string;
  /** Populated when `allowed` is false — user-facing, suitable for audit/error messages. */
  reason?: string;
}
