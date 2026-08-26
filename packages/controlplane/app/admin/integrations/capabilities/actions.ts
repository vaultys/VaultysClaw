"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertValidCapabilityName, isCustomCapability } from "@vaultysclaw/policy";
import { CustomCapabilityDAO, CapabilityCertificateDAO } from "@/db";
import { recordEvent } from "@/lib/audit";
import { requireAdmin } from "@/lib/require-admin";
import {
  capabilityAdminUrl,
  customCapabilityPayload,
  diffFields,
  type FieldChange,
} from "@/lib/webhook-payloads";
import { getWSServerInstance } from "@/lib/ws-server";

/**
 * Server Actions for the custom-capability registry (docs/CUSTOM_CAPABILITIES.md).
 *
 * A row here makes a `vendor:action` name grantable *and* resolvable, so these are the write side
 * of a security-relevant table: every action starts with `requireAdmin()`, and every name goes
 * through `@vaultysclaw/policy`'s validator rather than being trusted from the form. See
 * `lib/require-admin.ts` for why the layout's gate is not enough on its own.
 */

export async function createCapabilityAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const name = (formData.get("name") as string)?.trim().toLowerCase();
  const label = (formData.get("label") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const group = (formData.get("group") as string)?.trim() || null;

  if (!name || !label) throw new Error("Name and label are required");

  // Throws with a user-facing message describing the grammar. Lowercased above rather than
  // rejected on case, since a capitalised paste is a typo, not a different name — and two names
  // differing only by case must never both exist.
  assertValidCapabilityName(name);
  if (!isCustomCapability(name)) {
    throw new Error(
      `"${name}" is a built-in capability and is already grantable — the registry is only for custom "vendor:action" names`
    );
  }

  const existing = await CustomCapabilityDAO.findByName(name);
  if (existing) throw new Error(`"${name}" is already in the registry`);

  const created = await CustomCapabilityDAO.create({
    name,
    label,
    description,
    group,
    createdBy: admin.did,
  });

  await recordEvent({
    eventType: "capability.created",
    payload: {
      ...customCapabilityPayload(created),
      performedBy: admin,
      adminUrl: capabilityAdminUrl(created.id),
    },
    performedBy: admin,
    targetType: "capability",
    targetId: created.id,
  });

  revalidatePath("/admin/integrations");
  redirect(`/admin/integrations/capabilities/${created.id}`);
}

/**
 * Update the presentation fields.
 *
 * `name` is deliberately not editable — renaming would silently change which grants resolve, so it
 * is expressed as delete-and-recreate, which correctly reads as (and is) a revoke.
 */
export async function updateCapabilityAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = formData.get("id") as string;
  const label = (formData.get("label") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const group = (formData.get("group") as string)?.trim() || null;
  if (!id || !label) throw new Error("Label is required");

  const before = await CustomCapabilityDAO.findById(id);
  if (!before) throw new Error("Capability not found");

  const updated = await CustomCapabilityDAO.update(id, { label, description, group });

  const changes: FieldChange[] = diffFields(before, updated, ["label", "description", "group"]);
  await recordEvent({
    eventType: "capability.updated",
    payload: {
      ...customCapabilityPayload(updated),
      changes,
      performedBy: admin,
      adminUrl: capabilityAdminUrl(updated.id),
    },
    performedBy: admin,
    targetType: "capability",
    targetId: updated.id,
  });

  revalidatePath(`/admin/integrations/capabilities/${id}`);
  revalidatePath("/admin/integrations");
}

/**
 * Delete a registry entry — **a mass revoke**, not a tidy-up.
 *
 * Deleting the row is what makes every grant of this name stop resolving (`ws-server.ts` filters
 * held capabilities against this table before signing a status response). Three things happen
 * beyond the delete, in this order and for these reasons:
 *
 * 1. A typed confirmation of the name is required. The affected-grant count is shown next to the
 *    field, so the admin has seen the cost before they can type it.
 * 2. Certificates carrying the name are **revoked**, not rewritten. A certificate's capabilities
 *    live inside its signature; rewriting would mean re-minting under a new id and silently
 *    changing what a holder can prove. Revoking says what actually happened.
 * 3. Every affected holder currently connected gets an `actor_config` push, so the change is
 *    prompt rather than staple-TTL-late. Best-effort: the status filter is the authoritative
 *    mechanism and does not depend on the push arriving.
 */
export async function deleteCapabilityAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = formData.get("id") as string;
  const confirmName = (formData.get("confirmName") as string)?.trim();
  if (!id) throw new Error("Missing capability id");

  const capability = await CustomCapabilityDAO.findById(id);
  if (!capability) throw new Error("Capability not found");

  if (confirmName !== capability.name) {
    throw new Error(
      `Type the capability name exactly ("${capability.name}") to confirm — deleting it revokes every grant of it`
    );
  }

  // Collected before the delete: afterwards there is no name left to match against.
  const affectedCertIds = await CustomCapabilityDAO.findAffectedCertIds(capability.name);
  const holders = new Set<string>();
  for (const certId of affectedCertIds) {
    const cert = await CapabilityCertificateDAO.findById(certId);
    if (cert) holders.add(cert.agentDid);
  }

  await CustomCapabilityDAO.delete(id);

  for (const certId of affectedCertIds) {
    await CapabilityCertificateDAO.revoke(
      certId,
      admin.did,
      `Custom capability "${capability.name}" was removed from the registry`
    );
  }

  await recordEvent({
    eventType: "capability.deleted",
    payload: {
      ...customCapabilityPayload(capability),
      affectedGrants: affectedCertIds.length,
      performedBy: admin,
    },
    performedBy: admin,
    targetType: "capability",
    targetId: capability.id,
  });

  const ws = getWSServerInstance();
  for (const did of holders) void ws?.pushActorConfig(did);

  revalidatePath("/admin/integrations");
  redirect("/admin/integrations?tab=capabilities");
}
