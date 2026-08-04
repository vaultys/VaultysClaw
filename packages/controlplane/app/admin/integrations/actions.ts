"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WebhookDAO } from "@/db";
import { generateWebhookSecret } from "@/lib/webhook-secret";

/**
 * Returns the secret directly rather than redirecting — a Server Action can be called from a
 * Client Component and awaited for its return value just like any async function, not only via
 * `<form action>`; that's what lets `webhooks/new/page.tsx` show the raw secret once, in place,
 * without ever putting it in a URL or a redirect.
 */
export async function createWebhookAction(formData: FormData): Promise<{ id: string; secret: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const url = (formData.get("url") as string)?.trim();
  const events = formData.getAll("events") as string[];
  if (!name || !url) throw new Error("Name and URL are required");
  if (!url.startsWith("https://") && !url.startsWith("http://localhost") && !url.startsWith("http://127.0.0.1")) {
    throw new Error("URL must use https:// (or http://localhost for local testing)");
  }

  const secret = generateWebhookSecret();
  const webhook = await WebhookDAO.create({
    name,
    description: description || null,
    url,
    secret,
    events,
    createdBy: session.user.did,
  });

  revalidatePath("/admin/integrations");
  return { id: webhook.id, secret };
}

export async function updateWebhookAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const url = (formData.get("url") as string)?.trim();
  const events = formData.getAll("events") as string[];
  if (!id || !name || !url) throw new Error("Name and URL are required");

  await WebhookDAO.update(id, { name, description: description || null, url, events });
  revalidatePath("/admin/integrations");
  redirect("/admin/integrations");
}

export async function toggleWebhookActiveAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const isActive = formData.get("isActive") === "true";
  await WebhookDAO.update(id, { isActive });
  revalidatePath("/admin/integrations");
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  await WebhookDAO.delete(id);
  revalidatePath("/admin/integrations");
}

/** Same "return data directly" pattern as createWebhookAction — the new secret is shown once,
 *  client-side, never round-tripped through a URL. */
export async function regenerateWebhookSecretAction(id: string): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const secret = generateWebhookSecret();
  await WebhookDAO.regenerateSecret(id, secret);
  revalidatePath("/admin/integrations");
  revalidatePath(`/admin/integrations/webhooks/${id}`);
  return secret;
}
