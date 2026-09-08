"use server";

import { revalidatePath } from "next/cache";
import { SettingsDAO } from "@/db";
import { SETTINGS_KEYS } from "@/lib/org-settings";
import { requireAdmin } from "@/lib/require-admin";

export async function dismissOnboardingSetupAction(): Promise<void> {
  await requireAdmin();
  await SettingsDAO.set(SETTINGS_KEYS.adminOnboardingDismissed, "1");
  revalidatePath("/admin");
}
