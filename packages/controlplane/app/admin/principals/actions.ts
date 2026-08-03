"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { approvePendingRegistration, denyPendingRegistration } from "@/lib/registrations";
import type { AgentCapability } from "@vaultysclaw/policy";

export async function approveRegistrationAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const registrationId = formData.get("registrationId") as string;
  const capabilities = formData.getAll("capabilities") as AgentCapability[];

  await approvePendingRegistration(registrationId, capabilities, session.user.did);
  revalidatePath("/admin/principals");
  revalidatePath("/admin");
}

export async function denyRegistrationAction(formData: FormData): Promise<void> {
  const registrationId = formData.get("registrationId") as string;
  await denyPendingRegistration(registrationId);
  revalidatePath("/admin/principals");
  revalidatePath("/admin");
}
