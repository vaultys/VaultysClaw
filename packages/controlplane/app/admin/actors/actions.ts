"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { approvePendingRegistration, denyPendingRegistration } from "@/lib/registrations";
import { ActorDAO, UserDAO } from "@/db";
import { encodeDidParam } from "@/lib/actor-route";
import type { AgentCapability } from "@vaultysclaw/policy";

export async function approveRegistrationAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const registrationId = formData.get("registrationId") as string;
  const capabilities = formData.getAll("capabilities") as AgentCapability[];

  await approvePendingRegistration(registrationId, capabilities, session.user.did);
  revalidatePath("/admin/actors");
  revalidatePath("/admin");
}

export async function denyRegistrationAction(formData: FormData): Promise<void> {
  const registrationId = formData.get("registrationId") as string;
  await denyPendingRegistration(registrationId);
  revalidatePath("/admin/actors");
  revalidatePath("/admin");
}

/** Edits an Actor's own record — name/workspace for any kind, email additionally for humans
 *  (`User` is a 1:1 profile extension, see `packages/controlplane/CLAUDE.md`'s Actor/User note). */
export async function updateActorAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const did = formData.get("did") as string;
  const name = (formData.get("name") as string)?.trim();
  const workspaceId = (formData.get("workspaceId") as string) || null;
  if (!did || !name) throw new Error("Name is required");

  const actor = await ActorDAO.findByDid(did);
  if (!actor) throw new Error("Actor not found");

  await ActorDAO.update(did, { name, workspaceId });

  if (actor.kind === "human") {
    const email = (formData.get("email") as string)?.trim();
    await UserDAO.updateEmail(did, email || null);
  }

  revalidatePath(`/admin/actors/${encodeDidParam(did)}`);
  revalidatePath("/admin/actors");
}
