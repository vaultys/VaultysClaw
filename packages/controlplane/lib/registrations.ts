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

  // Sensors have no capability concept and the sensor binary doesn't speak the
  // service:"certificate" sub-protocol at all — granting one anyway would start an
  // interactive exchange the sensor silently ignores, leaving the registration stuck in
  // "approved, awaiting delivery" forever (ws-server.ts never gets a reply to complete it).
  const grantedCapabilities = registration.kind === "sensor" ? [] : capabilities;

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
