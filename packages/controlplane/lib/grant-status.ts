/**
 * The signed status assertion that travels alongside an interception point's
 * packcert grant.
 *
 * A packcert proves *what was granted*; it cannot prove the grant is still live,
 * because revocation is recorded after issuance and is deliberately not in the
 * signed bytes. Before this module the push carried only the grant, and the Go
 * recipient took "the file is on disk" to mean "active" and measured freshness
 * from the file's mtime — so a revoked grant kept authorizing until its signed
 * expiry, and `touch` renewed it.
 *
 * The assertion is an ordinary `cert_status_response` (`packages/policy`), the
 * same artefact the status protocol already signs, so there is one shape for
 * "the control plane says this certificate is X as of T". It is resolved through
 * the same predicate as `handleCertStatusRequest` — `resolveCertStatus`, which
 * applies the kill switch and the custom-capability registry — so a pushed
 * status can never be more permissive than a queried one.
 *
 * Two fields exist specifically for this use:
 *   - `aud`, the Actor the assertion was addressed to, so one Actor's "active"
 *     cannot be replayed to back another's decision;
 *   - `seq`, a monotonic counter, so an older "active" cannot be replayed over a
 *     newer "revoked".
 */
import { signCertStatusResponseCert, type CertScope } from "@vaultysclaw/policy";
import { CustomCapabilityDAO, ServerIdentityDAO } from "@/db";
import { getKillSwitchState, resolveCertStatus, type SuppressibleActor } from "./kill-switch";

/** The certificate-row fields the assertion is resolved from. */
export interface StatusSubjectCert {
  id: string;
  agentDid: string;
  status: string;
  capabilities: unknown;
  workspaceId: string | null;
  scope: unknown;
  resourceLimits: unknown;
  expiresAt: Date | null;
}

let lastSeq = 0;

/**
 * Next sequence number: clock-derived so it keeps increasing across a restart,
 * and bumped past the previous value so two assertions in the same millisecond
 * (or after a backwards clock step) still order strictly.
 */
export function nextStatusSeq(now: number = Date.now()): number {
  lastSeq = Math.max(now, lastSeq + 1);
  return lastSeq;
}

/**
 * Sign the current status of `cert` for the Actor `aud`.
 *
 * Kill switch and registry are read through their caches (5 s TTL, invalidated
 * on every in-process write), the same reads `handleCertStatusRequest` makes.
 */
export async function signGrantStatus(
  cert: StatusSubjectCert,
  holder: SuppressibleActor,
  aud: string
): Promise<string> {
  const now = Date.now();
  const { status, capabilities } = resolveCertStatus(
    {
      status: cert.status,
      capabilities: cert.capabilities as string[],
      workspaceId: cert.workspaceId,
      scope: cert.scope as CertScope | null,
      expiresAt: cert.expiresAt ? cert.expiresAt.getTime() : null,
    },
    holder,
    await getKillSwitchState(),
    new Set(await CustomCapabilityDAO.listNames()),
    now
  );

  const vid = await ServerIdentityDAO.getServerVaultysId();
  return signCertStatusResponseCert(vid, {
    certId: cert.id,
    agentDid: cert.agentDid,
    status,
    capabilities,
    resourceLimits: cert.resourceLimits as never,
    scope: cert.scope as never,
    expiresAt: cert.expiresAt ? cert.expiresAt.getTime() : null,
    aud,
    seq: nextStatusSeq(now),
    now,
  });
}
