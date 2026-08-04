"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { SettingsDAO } from "@/db";
import { SETTINGS_KEYS } from "@/lib/org-settings";

export async function updateGeneralSettingsAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const orgName = (formData.get("orgName") as string)?.trim();
  if (!orgName) throw new Error("Organization name is required");

  await SettingsDAO.set(SETTINGS_KEYS.orgName, orgName);
  // The org name is read into every /admin/* page via app/admin/layout.tsx.
  revalidatePath("/admin", "layout");
}

export async function updateTrustPolicyAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const failMode = formData.get("failMode") as string;
  if (failMode !== "open" && failMode !== "closed") {
    throw new Error("Fail mode must be 'open' or 'closed'");
  }

  const stapleTtlRaw = formData.get("stapleTtlSeconds") as string;
  const stapleTtlSeconds = Number.parseInt(stapleTtlRaw, 10);
  if (!Number.isFinite(stapleTtlSeconds) || stapleTtlSeconds < 0) {
    throw new Error("Staple TTL must be a non-negative number of seconds");
  }

  await SettingsDAO.set(SETTINGS_KEYS.trustFailMode, failMode);
  await SettingsDAO.set(SETTINGS_KEYS.trustStapleTtlSeconds, String(stapleTtlSeconds));
  revalidatePath("/admin/settings");
}
