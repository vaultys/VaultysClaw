"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { CapabilityCertificateDAO } from "@/db";
import { issueAdminGrant } from "@/lib/certificates";
import type { AgentCapability, CertScope } from "@vaultysclaw/policy";

export async function revokeCertificateAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const certId = formData.get("certId") as string;
  const reason = (formData.get("reason") as string) || "No reason given";
  await CapabilityCertificateDAO.revoke(certId, session.user.did, reason);
  revalidatePath("/admin/certificates");
  revalidatePath("/admin");
}

export async function issueCertificateAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const agentDid = formData.get("agentDid") as string;
  const capabilities = formData.getAll("capabilities") as AgentCapability[];
  const resource = (formData.get("resource") as string)?.trim();
  const expiryPreset = formData.get("expiryPreset") as string;
  const confirmNoExpiry = formData.get("confirmNoExpiry") === "on";

  if (!agentDid || capabilities.length === 0) {
    throw new Error("A Actor and at least one capability are required");
  }

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

  await issueAdminGrant({
    agentDid,
    capabilities,
    scope,
    expiresAt,
    issuedBy: session.user.did,
  });

  revalidatePath("/admin/certificates");
  revalidatePath("/admin");
  redirect("/admin/certificates");
}
