"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WebhookDAO, NotificationChannelDAO, ModelDAO, SettingsDAO } from "@/db";
import { generateWebhookSecret } from "@/lib/webhook-secret";
import { pushAppriseConfig, deleteAppriseConfig, extractServiceTypes } from "@/lib/apprise";
import { encryptSecret, decryptSecret } from "@/lib/vault";
import { recordEvent } from "@/lib/audit";
import { requireAdmin } from "@/lib/require-admin";
import { modelPayload, modelAdminUrl, diffFields, type FieldChange } from "@/lib/webhook-payloads";
import { isKnownProvider, isRoutableThroughLiteLLM } from "@/lib/model-providers";
import {
  litellmModelNameFor,
  isLiteLLMConfigured,
  probeProviderModels,
  registerModel,
  removeModel,
} from "@/lib/litellm";
import { SETTINGS_KEYS } from "@/lib/org-settings";

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

// ── Model Registry ──────────────────────────────────────────────────────────
//
// Two conventions worth stating once, since they apply to every action below.
//
// 1. **`requireAdmin()`, not a did-presence check.** The actions above predate
//    `lib/require-admin.ts` and only assert that *someone* is signed in; see
//    that file's header for why the admin layout's own gate does not cover a
//    Server Action. Retrofitting the older ones is tracked separately.
// 2. **LiteLLM failures are non-fatal, DB writes are not.** Postgres is the
//    source of truth (see the `ModelRegistry` schema comment). An unreachable
//    proxy must never stop an admin from recording, editing, or deleting a
//    model — it only means the registry entry isn't routable yet, which the UI
//    reports via `litellmModelName` being null.

/** Shared by create and update: push to the proxy if we can, and report whether we did.
 *  Never throws — the caller has already committed (or is about to commit) the DB write. */
async function syncToLiteLLM(model: {
  provider: string;
  modelId: string;
  baseUrl: string;
  litellmModelName: string | null;
  apiKeyPlain?: string | null;
}): Promise<{ registered: boolean; error?: string }> {
  if (!model.litellmModelName || !isRoutableThroughLiteLLM(model.provider)) {
    return { registered: false };
  }
  if (!(await isLiteLLMConfigured())) return { registered: false };
  try {
    await registerModel({
      modelName: model.litellmModelName,
      // Everything routable here speaks the OpenAI wire format, which is what
      // `openai/<modelId>` tells LiteLLM to use — matching the old package's
      // convention rather than inventing a second one.
      litellmModel: `openai/${model.modelId}`,
      apiBase: model.baseUrl,
      // Plaintext by construction: the caller either just read it off the form or
      // decrypted it. Passing `apiKeyEnc` here is the bug this signature avoids.
      apiKey: model.apiKeyPlain ?? undefined,
    });
    return { registered: true };
  } catch (err) {
    console.error("[models] LiteLLM registration failed (non-fatal)", err);
    return { registered: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createModelAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const provider = (formData.get("provider") as string)?.trim();
  const modelId = (formData.get("modelId") as string)?.trim();
  const baseUrl = (formData.get("baseUrl") as string)?.trim() ?? "";
  const apiKey = (formData.get("apiKey") as string)?.trim();

  if (!name || !modelId) throw new Error("Name and model ID are required");
  if (!isKnownProvider(provider)) throw new Error(`Unknown provider: ${provider}`);
  // SDK-agent providers have no endpoint at all, so an empty base URL is correct
  // for them and only for them (lib/model-providers.ts).
  if (!baseUrl && isRoutableThroughLiteLLM(provider)) {
    throw new Error("Base URL is required for this provider");
  }

  const litellmModelName = isRoutableThroughLiteLLM(provider)
    ? litellmModelNameFor(provider, name)
    : null;

  const model = await ModelDAO.create({
    name,
    description: description || null,
    provider,
    modelId,
    baseUrl,
    apiKeyEnc: apiKey ? await encryptSecret(apiKey) : null,
    litellmModelName,
    createdBy: performedBy.did,
  });

  await syncToLiteLLM({ provider, modelId, baseUrl, litellmModelName, apiKeyPlain: apiKey });

  await recordEvent({
    eventType: "model.created",
    payload: {
      ...modelPayload({ ...model, hasApiKey: !!apiKey, workspaceAccess: [] }),
      performedBy,
      adminUrl: modelAdminUrl(model.id),
    },
    performedBy,
    targetType: "model",
    targetId: model.id,
  });

  revalidatePath("/admin/integrations");
  redirect(`/admin/integrations/models/${model.id}`);
}

export async function updateModelAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const modelId = (formData.get("modelId") as string)?.trim();
  const baseUrl = (formData.get("baseUrl") as string)?.trim() ?? "";
  // Blank means "keep the existing key" — the field is write-only, same convention
  // as a Notification Channel's service URLs.
  const apiKey = (formData.get("apiKey") as string)?.trim();

  if (!id || !name || !modelId) throw new Error("Name and model ID are required");

  const before = await ModelDAO.findById(id);
  if (!before) throw new Error("Model not found");

  const updated = await ModelDAO.update(id, {
    name,
    description: description || null,
    modelId,
    baseUrl,
    ...(apiKey ? { apiKeyEnc: await encryptSecret(apiKey) } : {}),
    // The LiteLLM name is derived from the display name, so renaming the model
    // renames it upstream too. The old registration under the previous name is
    // removed below rather than left behind as an orphan.
    ...(before.litellmModelName ? { litellmModelName: litellmModelNameFor(before.provider, name) } : {}),
  });

  // Re-push only when something the proxy actually stores changed. Reading the key
  // back out means an endpoint/model-id edit doesn't silently drop the credential
  // from the upstream registration.
  const routingChanged =
    before.baseUrl !== baseUrl ||
    before.modelId !== modelId ||
    before.litellmModelName !== updated.litellmModelName ||
    !!apiKey;

  if (routingChanged) {
    let apiKeyPlain: string | null = apiKey || null;
    if (!apiKeyPlain) {
      const withSecret = await ModelDAO.findByIdWithSecret(id);
      if (withSecret?.apiKeyEnc) {
        try {
          apiKeyPlain = await decryptSecret(withSecret.apiKeyEnc);
        } catch (err) {
          console.error("[models] could not decrypt stored provider key for re-push", err);
        }
      }
    }
    if (before.litellmModelName && before.litellmModelName !== updated.litellmModelName) {
      try {
        await removeModel(before.litellmModelName);
      } catch (err) {
        console.error("[models] failed to remove previous LiteLLM registration", err);
      }
    }
    await syncToLiteLLM({
      provider: updated.provider,
      modelId: updated.modelId,
      baseUrl: updated.baseUrl,
      litellmModelName: updated.litellmModelName,
      apiKeyPlain,
    });
  }

  const after = await ModelDAO.findById(id);
  const changes = diffFields(
    before as unknown as Record<string, unknown>,
    (after ?? updated) as unknown as Record<string, unknown>,
    ["name", "description", "modelId", "baseUrl", "litellmModelName", "isActive"]
  );
  // A replaced credential is reported as a change without reporting the value —
  // "the key was rotated" is the auditable fact, the key itself never is.
  if (apiKey) changes.push({ field: "apiKey", from: "***", to: "***" });

  await recordEvent({
    eventType: "model.updated",
    payload: {
      ...modelPayload(after ?? { ...updated, hasApiKey: true, workspaceAccess: [] }),
      changes,
      performedBy,
      adminUrl: modelAdminUrl(id),
    },
    performedBy,
    targetType: "model",
    targetId: id,
  });

  revalidatePath("/admin/integrations");
  revalidatePath(`/admin/integrations/models/${id}`);
  redirect(`/admin/integrations/models/${id}`);
}

export async function toggleModelActiveAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  const isActive = formData.get("isActive") === "true";
  const before = await ModelDAO.findById(id);
  if (!before) throw new Error("Model not found");

  await ModelDAO.update(id, { isActive });
  const after = await ModelDAO.findById(id);

  await recordEvent({
    eventType: "model.updated",
    payload: {
      ...modelPayload(after ?? before),
      changes: [{ field: "isActive", from: before.isActive, to: isActive }] satisfies FieldChange[],
      performedBy,
      adminUrl: modelAdminUrl(id),
    },
    performedBy,
    targetType: "model",
    targetId: id,
  });

  revalidatePath("/admin/integrations");
  revalidatePath(`/admin/integrations/models/${id}`);
}

export async function deleteModelAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  const model = await ModelDAO.findById(id);
  if (!model) return;

  if (model.litellmModelName) {
    try {
      await removeModel(model.litellmModelName);
    } catch (err) {
      // Same reasoning as deleteChannelAction's Apprise call: an unreachable proxy
      // must not permanently trap a row in the admin's own list.
      console.error("[models] failed to remove LiteLLM registration", model.litellmModelName, err);
    }
  }

  await ModelDAO.delete(id);

  await recordEvent({
    eventType: "model.deleted",
    payload: {
      id: model.id,
      name: model.name,
      provider: model.provider,
      litellmModelName: model.litellmModelName,
      performedBy,
    },
    performedBy,
    targetType: "model",
    targetId: id,
  });

  revalidatePath("/admin/integrations");
  redirect("/admin/integrations?tab=models");
}

export async function setModelWorkspaceAccessAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  const workspaceId = formData.get("workspaceId") as string;
  const grant = formData.get("grant") === "true";
  if (!id || !workspaceId) throw new Error("Model and workspace are required");

  const before = await ModelDAO.findById(id);
  if (!before) throw new Error("Model not found");

  if (grant) {
    await ModelDAO.grantWorkspaceAccess(id, workspaceId);
  } else {
    await ModelDAO.revokeWorkspaceAccess(id, workspaceId);
  }
  const after = await ModelDAO.findById(id);

  // Emitted as model.updated with an explicit access diff rather than a new event
  // type: the catalog's Models group has no access-specific event, and inventing
  // one here would mean an event this package emits that packages/control-plane's
  // shared catalog doesn't define.
  await recordEvent({
    eventType: "model.updated",
    payload: {
      ...modelPayload(after ?? before),
      changes: [
        {
          field: "workspaceAccess",
          from: before.workspaceAccess.map((a) => a.workspaceId),
          to: (after ?? before).workspaceAccess.map((a) => a.workspaceId),
        },
      ] satisfies FieldChange[],
      performedBy,
      adminUrl: modelAdminUrl(id),
    },
    performedBy,
    targetType: "model",
    targetId: id,
  });

  revalidatePath(`/admin/integrations/models/${id}`);
  revalidatePath("/admin/integrations");
}

/**
 * Probe a provider endpoint from the register/edit form before anything is saved.
 * Returns its result instead of redirecting — same "await a Server Action for its
 * value from a Client Component" pattern as `createWebhookAction`.
 *
 * Admin-gated like every other action here even though it only reads: it makes
 * the server issue an outbound request to a caller-supplied URL, which is not
 * something an unprivileged session should be able to do.
 */
export async function probeModelEndpointAction(
  baseUrl: string,
  apiKey?: string
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  await requireAdmin();
  if (!baseUrl) return { ok: false, models: [], error: "No base URL" };
  return probeProviderModels(baseUrl, apiKey || undefined);
}

/**
 * The LiteLLM proxy connection itself. The master key is stored encrypted (the
 * `Enc` suffix on the settings key) and, like every other secret in this app, is
 * never read back into the form — blank means "keep the current one".
 */
export async function saveLiteLLMConfigAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const baseUrl = (formData.get("baseUrl") as string)?.trim() ?? "";
  const masterKey = (formData.get("masterKey") as string)?.trim();

  await SettingsDAO.set(SETTINGS_KEYS.litellmBaseUrl, baseUrl);
  if (masterKey) {
    await SettingsDAO.set(SETTINGS_KEYS.litellmMasterKeyEnc, await encryptSecret(masterKey));
  }

  revalidatePath("/admin/integrations");
}

/** Clears both halves, turning the proxy integration off without deleting any model rows. */
export async function clearLiteLLMConfigAction(): Promise<void> {
  await requireAdmin();
  await SettingsDAO.set(SETTINGS_KEYS.litellmBaseUrl, "");
  await SettingsDAO.set(SETTINGS_KEYS.litellmMasterKeyEnc, "");
  revalidatePath("/admin/integrations");
}

/** Re-push every routable model to the proxy — the "I just connected LiteLLM, catch it up"
 *  action, since models registered while it was unconfigured were never pushed. */
export async function resyncLiteLLMAction(): Promise<{ pushed: number; failed: number }> {
  await requireAdmin();
  if (!(await isLiteLLMConfigured())) return { pushed: 0, failed: 0 };

  const models = await ModelDAO.list();
  let pushed = 0;
  let failed = 0;
  for (const m of models) {
    if (!m.isActive || !isRoutableThroughLiteLLM(m.provider)) continue;
    const litellmModelName = m.litellmModelName ?? litellmModelNameFor(m.provider, m.name);
    if (!m.litellmModelName) await ModelDAO.update(m.id, { litellmModelName });

    let apiKeyPlain: string | null = null;
    if (m.hasApiKey) {
      const withSecret = await ModelDAO.findByIdWithSecret(m.id);
      if (withSecret?.apiKeyEnc) {
        try {
          apiKeyPlain = await decryptSecret(withSecret.apiKeyEnc);
        } catch {
          // Reported as a failed push below rather than aborting the whole resync.
        }
      }
    }
    const result = await syncToLiteLLM({
      provider: m.provider,
      modelId: m.modelId,
      baseUrl: m.baseUrl,
      litellmModelName,
      apiKeyPlain,
    });
    if (result.registered) pushed++;
    else failed++;
  }

  revalidatePath("/admin/integrations");
  return { pushed, failed };
}
