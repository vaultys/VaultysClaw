"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { CapabilityCertificateDAO, ActorDAO } from "@/db";
import { issueAdminGrant } from "@/lib/certificates";
import { recordEvent } from "@/lib/audit";
import { requireAdmin } from "@/lib/require-admin";
import { grantableCapabilitiesForKind } from "@/lib/capabilities";
import { certificatePayload, buildAdminUrl } from "@/lib/webhook-payloads";
import { getWSServerInstance } from "@/lib/ws-server";
import type { AgentCapability, CertScope } from "@vaultysclaw/policy";

export async function revokeCertificateAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const certId = formData.get("certId") as string;
  const reason = (formData.get("reason") as string) || "No reason given";
  const cert = await CapabilityCertificateDAO.revoke(certId, session.user.did, reason);
  const performedBy = { did: session.user.did, name: session.user.name ?? "Unnamed" };
  await recordEvent({
    eventType: "certificate.revoked",
    payload: { ...certificatePayload(cert), performedBy, adminUrl: buildAdminUrl(`/admin/certificates/${cert.id}`) },
    performedBy,
    targetType: "certificate",
    targetId: cert.id,
  });
  const ws = getWSServerInstance();
  ws?.notifyCapabilitiesChanged(cert.agentDid, "certificate_revoked", [cert.id]);
  void ws?.pushActorConfig(cert.agentDid);
  revalidatePath("/admin/certificates");
  revalidatePath("/admin");
}

export async function issueCertificateAction(formData: FormData): Promise<void> {
  // `requireAdmin` rather than the weaker session-presence test: an action is a POST to its own
  // endpoint and does not re-run the admin layout's gate, so issuing a certificate was reachable
  // by any authenticated session. See `lib/require-admin.ts`.
  const performedBy = await requireAdmin();

  const agentDid = formData.get("agentDid") as string;
  const submitted = formData.getAll("capabilities") as AgentCapability[];
  const resource = (formData.get("resource") as string)?.trim();
  const expiryPreset = formData.get("expiryPreset") as string;
  const confirmNoExpiry = formData.get("confirmNoExpiry") === "on";

  if (!agentDid || submitted.length === 0) {
    throw new Error("A Actor and at least one capability are required");
  }

  // Filter against what is actually grantable for this Actor's kind — the same allow-list the
  // registration-approval path uses. Without this, a form post could mint a grant naming a custom
  // capability that is not in the registry (or was deleted while the form was open); the status
  // filter would strip it on the holder's first refresh, but the ledger would meanwhile show a
  // capability nobody ever authorized. Refuse rather than silently narrow: an admin who ticked
  // something should be told it didn't apply, not left to notice later.
  const actor = await ActorDAO.findByDid(agentDid);
  if (!actor) throw new Error("Actor not found");
  const grantable = await grantableCapabilitiesForKind(actor.kind);
  const rejected = submitted.filter((c) => !grantable.includes(c));
  if (rejected.length > 0) {
    throw new Error(
      `Not grantable to a "${actor.kind}" actor: ${rejected.join(", ")}. ` +
        `A custom capability must exist in the registry (Integrations → Capabilities).`
    );
  }
  const capabilities = submitted;

  const scope: CertScope | null = resource ? { resource } : null;

  let expiresAt: number | null;
  if (expiryPreset === "never") {
    if (!confirmNoExpiry) {
      throw new Error("Confirm the no-expiry checkbox to issue a standing certificate");
    }
    expiresAt = null;
  } else {
    const presetMs: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "1y": 365 * 24 * 60 * 60 * 1000,
    };
    expiresAt = Date.now() + (presetMs[expiryPreset] ?? presetMs["30d"]);
  }

  const cert = await issueAdminGrant({
    agentDid,
    capabilities,
    scope,
    expiresAt,
    issuedBy: performedBy.did,
  });
  await recordEvent({
    eventType: "certificate.issued",
    payload: { ...certificatePayload(cert), performedBy, adminUrl: buildAdminUrl(`/admin/certificates/${cert.id}`) },
    performedBy,
    targetType: "certificate",
    targetId: cert.id,
  });
  const ws = getWSServerInstance();
  if (!ws?.deliverCertificate(cert)) {
    ws?.notifyCapabilitiesChanged(cert.agentDid, "certificate_issued", [cert.id]);
  }
  void ws?.pushActorConfig(cert.agentDid);

  revalidatePath("/admin/certificates");
  revalidatePath("/admin");
  redirect("/admin/certificates");
}
