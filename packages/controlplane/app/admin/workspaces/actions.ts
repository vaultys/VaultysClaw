"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WorkspaceDAO, ActorDAO } from "@/db";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8)
  );
}

export async function createWorkspaceAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const color = (formData.get("color") as string) || undefined;
  if (!name) throw new Error("Name is required");

  const id = randomUUID();
  // Existing workspaces are few enough in practice that a slug collision (same name twice) is an
  // acceptable, rare edge case — append a short suffix rather than rejecting the whole form.
  const base = slugify(name);
  const existing = await WorkspaceDAO.list();
  const slug = existing.some((w) => w.slug === base) ? `${base}-${id.slice(0, 6)}` : base;

  await WorkspaceDAO.create({ id, name, slug, description: description || undefined, color });
  revalidatePath("/admin/workspaces");
  redirect(`/admin/workspaces/${id}`);
}

export async function updateWorkspaceAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const color = (formData.get("color") as string) || undefined;
  if (!id || !name) throw new Error("Name is required");

  await WorkspaceDAO.update(id, { name, description: description || null, color });
  revalidatePath(`/admin/workspaces/${id}`);
  revalidatePath("/admin/workspaces");
}

/**
 * A minimal, purpose-specific action rather than reusing
 * `app/admin/actors/actions.ts`'s `updateActorAction` — that one treats a
 * missing `email` field as "clear the human's email," which would silently
 * wipe it every time an actor is (re)assigned to a workspace from here.
 */
export async function assignActorWorkspaceAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const did = formData.get("did") as string;
  const workspaceId = (formData.get("workspaceId") as string) || null;
  if (!did) throw new Error("Actor is required");

  await ActorDAO.update(did, { workspaceId });
  if (workspaceId) revalidatePath(`/admin/workspaces/${workspaceId}`);
  revalidatePath("/admin/workspaces");
  revalidatePath("/admin/actors");
}
