/**
 * Writing a control-plane-signed grant straight into the ledger.
 *
 * Shared by `admin.ts` (one admin human) and `people.ts` (a whole population), because they are
 * doing the same thing for the same reason: a `kind: "human"` Actor is onboarded through login, not
 * through the WS registration handshake, so there is no client-side route by which the simulator
 * could earn one of these. It stands in for the control plane itself — which is exactly what the
 * co-signed request/grant pair records (`lib/certificates.ts`'s `issueAdminGrant`, trust doc §3.2):
 * the control plane signs *both* halves, and that is the ledger's own way of saying nobody asked
 * for this grant.
 *
 * **Only ever point this at a disposable database.** It is a deliberate back door around admin
 * approval, appropriate for a stack whose whole purpose is being reset and for nothing else.
 */

import { randomUUID } from "node:crypto";
import { VaultysId } from "@vaultys/id";
import {
  signCapabilityGrantCert,
  signCapabilityRequestCert,
  type AgentCapability,
} from "@vaultysclaw/policy";
import type { PrismaClient } from "@prisma/client";

/**
 * The control plane's own VaultysId, read from the `serverSecret` setting it generates on first
 * start.
 *
 * Fails loudly when there isn't one: a control plane that has never run has no key to sign with,
 * and the alternative is a Prisma null-dereference several frames away from the actual problem.
 */
export async function serverIdentity(db: PrismaClient): Promise<VaultysId> {
  const serverSecret = await db.setting.findUnique({
    where: { key: "serverSecret" },
  });
  if (!serverSecret?.value) {
    throw new Error(
      "This control plane has no server identity yet — start it once (`pnpm simulator:up`) so it " +
        "can generate one, then run this again."
    );
  }
  return VaultysId.fromSecret(serverSecret.value, "base64").toVersion(1);
}

/**
 * Issue a standing (never-expiring) grant to `subjectDid` and record it.
 *
 * Standing, like the bootstrap grant: an identity whose access silently expires mid-demo is a worse
 * failure than one that outlives the database it is for — and the database is disposable anyway.
 */
export async function issueStandingGrant(
  db: PrismaClient,
  serverVid: VaultysId,
  subjectDid: string,
  capabilities: AgentCapability[],
  issuedBy: string
): Promise<string> {
  const certId = randomUUID();
  const requestCert = await signCapabilityRequestCert(serverVid, {
    agentDid: subjectDid,
    requestedCapabilities: capabilities,
    nonce: `${issuedBy}-${Date.now()}-${certId.slice(0, 8)}`,
  });
  const certificate = await signCapabilityGrantCert(serverVid, {
    certId,
    agentDid: subjectDid,
    workspaceId: null,
    grantedCapabilities: capabilities,
    resourceLimits: null,
    scope: null,
    requestCert,
    expiresAt: null,
  });

  await db.capabilityCertificate.create({
    data: {
      id: certId,
      agentDid: subjectDid,
      workspaceId: null,
      capabilities: capabilities as never,
      resourceLimits: undefined,
      scope: undefined,
      certFormat: "packcert",
      certificate,
      requestCertificate: requestCert,
      expiresAt: null,
      issuedBy,
    },
  });

  return certId;
}
