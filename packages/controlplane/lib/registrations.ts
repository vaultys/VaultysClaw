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
import { enqueueWebhook } from "./webhook-queue";
import { actorPayload, actorAdminUrl, buildAdminUrl, type PerformedBy } from "./webhook-payloads";

export async function approvePendingRegistration(
  registrationId: string,
  capabilities: AgentCapability[],
  approver: PerformedBy
): Promise<void> {
  const registration = await PendingRegistrationDAO.findById(registrationId);
  if (!registration || registration.status !== "pending") {
    throw new Error("Registration not found or already resolved");
  }

  const actor = await ActorDAO.upsert({
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

  void enqueueWebhook({
    eventType: "actor.approved",
    payload: {
      ...actorPayload(actor),
      performedBy: approver,
      adminUrl: actorAdminUrl(actor.did),
      // Not a before/after diff (there's no prior Actor state to compare against) — what was
      // actually granted, which is the change that matters here.
      grantedCapabilities,
    },
  });

  await PendingRegistrationDAO.approve(
    registrationId,
    grantedCapabilities,
    approver.did,
    registration.targetWorkspaceId
  );

  // Best-effort: delivers immediately if the agent is still connected;
  // otherwise it's picked up on its next successful auth handshake
  // (`deliverIfApproved` in ws-server.ts).
  await getWSServerInstance()?.deliverApprovedCapabilities(registration.did);
}

export async function denyPendingRegistration(registrationId: string, denier: PerformedBy): Promise<void> {
  const registration = await PendingRegistrationDAO.findById(registrationId);
  if (!registration || registration.status !== "pending") {
    throw new Error("Registration not found or already resolved");
  }
  await PendingRegistrationDAO.deny(registrationId);
  void enqueueWebhook({
    eventType: "actor.denied",
    payload: {
      did: registration.did,
      name: registration.name,
      kind: registration.kind,
      performedBy: denier,
      // No Actor row exists for a denied registration — link to the list, not a detail page that
      // would 404.
      adminUrl: buildAdminUrl("/admin/actors"),
    },
  });
}
