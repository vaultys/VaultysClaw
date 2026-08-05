"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WebhookDAO, NotificationChannelDAO } from "@/db";
import { generateWebhookSecret } from "@/lib/webhook-secret";
import { pushAppriseConfig, deleteAppriseConfig, extractServiceTypes } from "@/lib/apprise";
import { encryptSecret } from "@/lib/vault";

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

// ── Notification Channels ───────────────────────────────────────────────────

function generateAppriseKey(): string {
  return `ch_${randomBytes(8).toString("hex")}`;
}

export async function createChannelAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const serviceUrls = (formData.get("serviceUrls") as string)?.trim();
  const events = formData.getAll("events") as string[];
  if (!name || !serviceUrls) throw new Error("Name and at least one service URL are required");

  const appriseKey = generateAppriseKey();
  // Push to Apprise BEFORE creating the row — if Apprise is unreachable or rejects the URLs, the
  // admin needs to see that now, not discover a channel that silently never delivers anything.
  await pushAppriseConfig(appriseKey, serviceUrls);
  const encrypted = await encryptSecret(serviceUrls);

  await NotificationChannelDAO.create({
    name,
    description: description || null,
    appriseKey,
    serviceUrls: encrypted,
    serviceTypes: extractServiceTypes(serviceUrls),
    events,
    createdBy: session.user.did,
  });

  revalidatePath("/admin/integrations");
  redirect("/admin/integrations?tab=channels");
}

export async function updateChannelAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const serviceUrls = (formData.get("serviceUrls") as string)?.trim();
  const events = formData.getAll("events") as string[];
  if (!id || !name) throw new Error("Name is required");

  const channel = await NotificationChannelDAO.findById(id);
  if (!channel) throw new Error("Channel not found");

  // Blank means "keep the existing service URLs" — the field is write-only (see
  // channels/[id]/page.tsx), so an admin who isn't changing them just leaves it empty.
  if (serviceUrls) {
    await pushAppriseConfig(channel.appriseKey, serviceUrls);
  }

  await NotificationChannelDAO.update(id, {
    name,
    description: description || null,
    events,
    ...(serviceUrls
      ? { serviceUrls: await encryptSecret(serviceUrls), serviceTypes: extractServiceTypes(serviceUrls) }
      : {}),
  });

  revalidatePath("/admin/integrations");
  redirect("/admin/integrations?tab=channels");
}

export async function toggleChannelActiveAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const isActive = formData.get("isActive") === "true";
  await NotificationChannelDAO.update(id, { isActive });
  revalidatePath("/admin/integrations");
}

export async function deleteChannelAction(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const id = formData.get("id") as string;
  const channel = await NotificationChannelDAO.findById(id);
  if (!channel) return;

  // Best-effort on the Apprise side: an unreachable Apprise shouldn't permanently block an admin
  // from removing a channel from their own list — worst case, an unused config key lingers there.
  try {
    await deleteAppriseConfig(channel.appriseKey);
  } catch (err) {
    console.error("[notification-channels] failed to delete Apprise config", channel.appriseKey, err);
  }

  await NotificationChannelDAO.delete(id);
  revalidatePath("/admin/integrations");
}
