/**
 * Turns a `PendingRegistration` into a real `Principal` + initial
 * `CapabilityCertificate` grant (docs/REBUILD_ARCHITECTURE.md §4.2). The
 * agent itself isn't asked again — the DID and requested capabilities were
 * already proven/captured during the WS handshake (`lib/ws-server.ts`); an
 * admin just decides what to actually grant.
 */
import type { AgentCapability } from "@vaultysclaw/policy";
import { PendingRegistrationDAO, PrincipalDAO } from "@/db";
import { issueAdminGrant } from "./certificates";

export async function approvePendingRegistration(
  registrationId: string,
  capabilities: AgentCapability[],
  approverDid: string
): Promise<void> {
  const registration = await PendingRegistrationDAO.findById(registrationId);
  if (!registration || registration.status !== "pending") {
    throw new Error("Registration not found or already resolved");
  }

  await PrincipalDAO.upsert({
    did: registration.did,
    name: registration.name,
    kind: registration.kind,
    workspaceId: registration.targetWorkspaceId,
  });

  // Standing grant with a real (not indefinite) expiry — the "no expiry"
  // exception is reserved for the bootstrap admin path (trust doc §3.3).
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  await issueAdminGrant({
    agentDid: registration.did,
    workspaceId: registration.targetWorkspaceId,
    capabilities,
    expiresAt: Date.now() + oneYearMs,
    issuedBy: approverDid,
  });

  await PendingRegistrationDAO.approve(registrationId, capabilities, registration.targetWorkspaceId);
}

export async function denyPendingRegistration(registrationId: string): Promise<void> {
  const registration = await PendingRegistrationDAO.findById(registrationId);
  if (!registration || registration.status !== "pending") {
    throw new Error("Registration not found or already resolved");
  }
  await PendingRegistrationDAO.deny(registrationId);
}
