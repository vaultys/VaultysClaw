/**
 * Certificate issuance — the DB-aware wrapper around `@vaultysclaw/policy`'s
 * capability-grant cert primitives, mirroring the existing
 * `lib/intent-signing.ts` pattern: resolve the control plane's identity from
 * `serverSecret`, delegate signing to the engine, persist the result.
 *
 * See docs/CERTIFICATE_WEB_OF_TRUST.md §3.2 (issuance) and
 * docs/REBUILD_ARCHITECTURE.md §4.5 (the bootstrap admin exception).
 */
import { randomUUID } from "crypto";
import { VaultysId } from "@vaultys/id";
import {
  signCapabilityRequestCert,
  signCapabilityGrantCert,
  type AgentCapability,
  type CertScope,
  type ResourceLimits,
} from "@vaultysclaw/policy";
import { CapabilityCertificateDAO, ServerIdentityDAO } from "@/db";
import type { CapabilityCertificate } from "@prisma/client";

export interface IssueCapabilityGrantInput {
  agentDid: string;
  workspaceId?: string | null;
  capabilities: AgentCapability[];
  resourceLimits?: ResourceLimits | null;
  scope?: CertScope | null;
  /** The agent's own signed capability_request cert — the co-signature (§3.2). */
  requestCert: string;
  /** Ms since epoch, or null for a certificate that does not auto-expire. */
  expiresAt: number | null;
  issuedBy?: string | null;
  /** Override the generated id — used by {@link ensureBootstrapAdmin} for its race guard. */
  certId?: string;
}

/** Sign and persist a capability grant. The control plane always co-signs; it never issues unilaterally without an embedded request. */
export async function issueCapabilityGrant(
  input: IssueCapabilityGrantInput
): Promise<CapabilityCertificate> {
  const vid = await ServerIdentityDAO.getServerVaultysId();
  const certId = input.certId ?? randomUUID();

  const certificate = await signCapabilityGrantCert(vid, {
    certId,
    agentDid: input.agentDid,
    workspaceId: input.workspaceId ?? null,
    grantedCapabilities: input.capabilities,
    resourceLimits: input.resourceLimits ?? null,
    scope: input.scope ?? null,
    requestCert: input.requestCert,
    expiresAt: input.expiresAt,
  });

  return CapabilityCertificateDAO.create({
    id: certId,
    agentDid: input.agentDid,
    workspaceId: input.workspaceId,
    capabilities: input.capabilities,
    resourceLimits: input.resourceLimits,
    scope: input.scope,
    certificate,
    requestCertificate: input.requestCert,
    expiresAt: input.expiresAt,
    issuedBy: input.issuedBy,
  });
}

/**
 * Self-signs the "request" half of a grant on behalf of the control plane
 * itself, for the cases where nobody actually asked for this grant — an
 * admin approving a pending registration, or the bootstrap exception below.
 * An inspector of the ledger can see both halves of the co-signature were
 * signed by the same key, which is itself the audit signal that this was a
 * system-issued grant, not a normal agent-requested one (trust doc §3.2).
 */
async function signSystemRequestCert(
  agentDid: string,
  capabilities: AgentCapability[],
  nonce: string
): Promise<string> {
  const vid = await ServerIdentityDAO.getServerVaultysId();
  return signCapabilityRequestCert(vid, { agentDid, requestedCapabilities: capabilities, nonce });
}

/**
 * An admin (or the system) vouching for a Principal's capabilities directly —
 * used to approve a `PendingRegistration` into a real grant. Agents don't yet
 * send a signed `capability_request` over the wire (deferred, see
 * packages/controlplane/CLAUDE.md), so this is the only issuance path for a
 * new agent's *initial* grant; a future agent-requested top-up would use
 * {@link issueCapabilityGrant} directly with the agent's own signed request.
 */
export async function issueAdminGrant(input: {
  agentDid: string;
  workspaceId?: string | null;
  capabilities: AgentCapability[];
  scope?: CertScope | null;
  expiresAt: number | null;
  issuedBy: string;
}): Promise<CapabilityCertificate> {
  const requestCert = await signSystemRequestCert(
    input.agentDid,
    input.capabilities,
    `admin-grant-${Date.now()}`
  );
  return issueCapabilityGrant({
    agentDid: input.agentDid,
    workspaceId: input.workspaceId,
    capabilities: input.capabilities,
    scope: input.scope,
    requestCert,
    expiresAt: input.expiresAt,
    issuedBy: input.issuedBy,
  });
}

/**
 * The bootstrap exception (docs/REBUILD_ARCHITECTURE.md §4.5): on the first
 * human to reach this check when no `admin_console_access` certificate exists
 * anywhere yet, mint one — no approval step, standing (`expiresAt: null`),
 * tagged `system:bootstrap`. Idempotent and safe to call on every human login;
 * it only ever acts once per deployment, guarded by the existence check.
 *
 * Fixed, deterministic id for the bootstrap grant — not `randomUUID()`. Two
 * humans racing to be "first" both pass the existence check before either
 * commits; the second `create()` then collides on this id (Prisma P2002) and
 * is treated as "someone else already bootstrapped," rather than silently
 * minting two standing admin grants. A real unique-constraint collision is a
 * cheaper and more honest guard here than a distributed lock for something
 * that fires at most once per deployment.
 */
const BOOTSTRAP_ADMIN_CERT_ID = "bootstrap-admin-cert";

export async function ensureBootstrapAdmin(
  humanDid: string
): Promise<CapabilityCertificate | null> {
  const alreadyExists = await CapabilityCertificateDAO.existsActiveWithCapability(
    "admin_console_access"
  );
  if (alreadyExists) return null;

  const requestCert = await signSystemRequestCert(
    humanDid,
    ["admin_console_access"],
    "bootstrap"
  );

  try {
    return await issueCapabilityGrant({
      certId: BOOTSTRAP_ADMIN_CERT_ID,
      agentDid: humanDid,
      capabilities: ["admin_console_access"],
      requestCert,
      expiresAt: null,
      issuedBy: "system:bootstrap",
    });
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === "P2002") return null; // lost the race — someone else bootstrapped first
    throw err;
  }
}

/** Constructs a `VaultysId` from a raw public key, for verifying a Principal's own signed request. */
export function vaultysIdFromPublicKey(publicKey: Uint8Array): VaultysId {
  return VaultysId.fromId(publicKey as never).toVersion(1);
}
