"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SrtTemplateDAO } from "@/db";
import { requireAdmin } from "@/lib/require-admin";
import { parseSrtSettings, splitDomains } from "@/lib/certificate-form";

/**
 * Confinement template management.
 *
 * Every action starts with `requireAdmin`, not a session-presence check: Next
 * dispatches an action as a POST to its own endpoint without re-running the
 * layout it is defined under, so the admin gate in `app/admin/layout.tsx` does
 * not protect it (`lib/require-admin.ts`).
 *
 * These mutations are deliberately **not** recorded as domain events. A template
 * grants nothing, revokes nothing and is not a term of any grant — the audit
 * trail that matters is `certificate.issued`, which records the settings that
 * were actually signed, whatever template they happened to come from.
 */

function readForm(formData: FormData) {
  const name = ((formData.get("name") as string) ?? "").trim();
  if (name === "") throw new Error("A template name is required");

  return {
    name,
    description: ((formData.get("description") as string) ?? "").trim() || null,
    settings: parseSrtSettings((formData.get("srt") as string) ?? "") ?? {},
    allowedDomains: splitDomains((formData.get("allowedDomains") as string) ?? ""),
  };
}

export async function createTemplateAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();
  const input = readForm(formData);
  await SrtTemplateDAO.create({ ...input, createdBy: performedBy.did });
  revalidatePath("/admin/certificates/templates");
  redirect("/admin/certificates/templates");
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) throw new Error("Missing template id");
  await SrtTemplateDAO.update(id, readForm(formData));
  revalidatePath("/admin/certificates/templates");
  redirect("/admin/certificates/templates");
}

/**
 * Delete a template.
 *
 * Revokes nothing, unlike deleting a custom capability: certificates issued from
 * this template carry their own signed copy of the settings and keep enforcing
 * them. Only future pre-filling is lost.
 */
export async function deleteTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) throw new Error("Missing template id");
  await SrtTemplateDAO.delete(id);
  revalidatePath("/admin/certificates/templates");
}

/**
 * Workspace attachment.
 *
 * Both admin surfaces — this page's "Workspaces" section and the workspace
 * detail page's Confinement tab — post to these same three actions, so each
 * revalidates both paths rather than guessing where the form was submitted
 * from.
 */
function readPair(formData: FormData): { workspaceId: string; templateId: string } {
  const workspaceId = ((formData.get("workspaceId") as string) ?? "").trim();
  const templateId = ((formData.get("templateId") as string) ?? "").trim();
  if (!workspaceId) throw new Error("Missing workspace");
  return { workspaceId, templateId };
}

function revalidateBoth(workspaceId: string) {
  revalidatePath("/admin/certificates/templates");
  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

/** Attach a template to a workspace, without changing its default. */
export async function attachTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const { workspaceId, templateId } = readPair(formData);
  if (templateId === "") return;
  await SrtTemplateDAO.attach(workspaceId, templateId);
  revalidateBoth(workspaceId);
}

/** Detach a template from a workspace. */
export async function detachTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const { workspaceId, templateId } = readPair(formData);
  if (templateId === "") throw new Error("Missing template");
  await SrtTemplateDAO.detach(workspaceId, templateId);
  revalidateBoth(workspaceId);
}

/** Mark a template as a workspace's default — an empty id clears it. */
export async function setDefaultTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const { workspaceId, templateId } = readPair(formData);
  await SrtTemplateDAO.setDefault(workspaceId, templateId === "" ? null : templateId);
  revalidateBoth(workspaceId);
}
