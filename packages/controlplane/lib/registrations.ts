/**
 * Turns a `PendingRegistration` into a real `Actor`, then delivers the
 * capability grant via the live `service: "certificate"` Challenger exchange
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b) instead of admin-issuing a
 * packcert-format grant directly — the agent's own co-signature is what
 * makes this format live/interactive rather than a system-issued token. The
 * admin only decides *what* to grant; `ws-server.ts` runs the actual
 * exchange and persists the resulting certificate once it completes.
 */
import type { AgentCapability } from "@vaultysclaw/policy";
import { PendingRegistrationDAO, ActorDAO } from "@/db";
import { getWSServerInstance } from "./ws-server";
import { allowedCapabilitiesForKind } from "./capabilities";

export async function approvePendingRegistration(
  registrationId: string,
  capabilities: AgentCapability[],
  approverDid: string
): Promise<void> {
  const registration = await PendingRegistrationDAO.findById(registrationId);
  if (!registration || registration.status !== "pending") {
    throw new Error("Registration not found or already resolved");
  }

  await ActorDAO.upsert({
    did: registration.did,
    name: registration.name,
    kind: registration.kind,
    publicKey: registration.publicKey,
    workspaceId: registration.targetWorkspaceId,
  });

  // Filtered against an allow-list per kind, not trusted as-is — a sensor's only capability
  // today is "process_read" (lib/capabilities.ts); anything else submitted for it is dropped
  // rather than granted, even via a direct form post.
  const grantedCapabilities = capabilities.filter((c) =>
    allowedCapabilitiesForKind(registration.kind).includes(c)
  );

  await PendingRegistrationDAO.approve(
    registrationId,
    grantedCapabilities,
    approverDid,
    registration.targetWorkspaceId
  );

  // Best-effort: delivers immediately if the agent is still connected;
  // otherwise it's picked up on its next successful auth handshake
  // (`deliverIfApproved` in ws-server.ts).
  await getWSServerInstance()?.deliverApprovedCapabilities(registration.did);
}

export async function denyPendingRegistration(registrationId: string): Promise<void> {
  const registration = await PendingRegistrationDAO.findById(registrationId);
  if (!registration || registration.status !== "pending") {
    throw new Error("Registration not found or already resolved");
  }
  await PendingRegistrationDAO.deny(registrationId);
}
