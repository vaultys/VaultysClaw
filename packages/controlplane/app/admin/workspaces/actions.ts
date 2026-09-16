"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WorkspaceDAO, ActorDAO, CapabilityCertificateDAO } from "@/db";
import { requireAdmin } from "@/lib/require-admin";
import { getWSServerInstance } from "@/lib/ws-server";
import { recordEvent } from "@/lib/audit";
import { workspacePayload, buildAdminUrl, diffFields } from "@/lib/webhook-payloads";
import { invalidateTrustPolicyCache } from "@/lib/trust-policy";

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

  const workspace = await WorkspaceDAO.create({ id, name, slug, description: description || undefined, color });
  const performedBy = { did: session.user.did, name: session.user.name ?? "Unnamed" };
  await recordEvent({
    eventType: "workspace.created",
    payload: { ...workspacePayload(workspace), performedBy, adminUrl: buildAdminUrl(`/admin/workspaces/${workspace.id}`) },
    performedBy,
    targetType: "workspace",
    targetId: workspace.id,
  });
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

  const before = await WorkspaceDAO.findById(id);
  const workspace = await WorkspaceDAO.update(id, { name, description: description || null, color });
  const performedBy = { did: session.user.did, name: session.user.name ?? "Unnamed" };
  await recordEvent({
    eventType: "workspace.updated",
    payload: {
      ...workspacePayload(workspace),
      performedBy,
      adminUrl: buildAdminUrl(`/admin/workspaces/${workspace.id}`),
      changes: before ? diffFields(before, workspace, ["name", "description", "color"]) : [],
    },
    performedBy,
    targetType: "workspace",
    targetId: workspace.id,
  });
  revalidatePath(`/admin/workspaces/${id}`);
  revalidatePath("/admin/workspaces");
}

/**
 * Set (or clear) this workspace's trust-policy overrides — fail mode and staple TTL,
 * docs/CERTIFICATE_WEB_OF_TRUST.md §5.3.
 *
 * `"inherit"` on either field is stored as NULL, and that is the *only* way to say
 * "use the org-wide value": a cleared number field would be indistinguishable from
 * `0`, which is a real and deliberately strict staple TTL ("force a live query every
 * time"). The two fields inherit independently, so a workspace can pin its fail mode
 * and still follow the org on staleness.
 *
 * Separate from `updateWorkspaceAction` on purpose. That one posts name/description/color
 * from a different form, and a shared action would have to treat every absent field as
 * "unchanged", which is exactly the ambiguity that makes "clear this override" unexpressible.
 */
export async function updateWorkspaceTrustPolicyAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const id = formData.get("id") as string;
  if (!id) throw new Error("Workspace is required");

  const failModeRaw = formData.get("failMode") as string;
  if (failModeRaw !== "inherit" && failModeRaw !== "open" && failModeRaw !== "closed") {
    throw new Error("Fail mode must be 'inherit', 'open' or 'closed'");
  }
  const certFailMode = failModeRaw === "inherit" ? null : failModeRaw;

  const stapleTtlMode = formData.get("stapleTtlMode") as string;
  if (stapleTtlMode !== "inherit" && stapleTtlMode !== "custom") {
    throw new Error("Staple TTL must either be inherited or set explicitly");
  }
  let certStapleTtlSeconds: number | null = null;
  if (stapleTtlMode === "custom") {
    const parsed = Number.parseInt(formData.get("stapleTtlSeconds") as string, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("Staple TTL must be a non-negative number of seconds");
    }
    certStapleTtlSeconds = parsed;
  }

  const before = await WorkspaceDAO.findById(id);
  if (!before) throw new Error("Workspace not found");

  const workspace = await WorkspaceDAO.update(id, { certFailMode, certStapleTtlSeconds });
  // Before the push, not after: a stale cache would let the fan-out below rebuild
  // every Actor's config from the values that were just replaced.
  invalidateTrustPolicyCache();

  await recordEvent({
    eventType: "workspace.updated",
    payload: {
      ...workspacePayload(workspace),
      performedBy,
      adminUrl: buildAdminUrl(`/admin/workspaces/${workspace.id}?tab=settings`),
      changes: diffFields(before, workspace, ["certFailMode", "certStapleTtlSeconds"]),
    },
    performedBy,
    targetType: "workspace",
    targetId: workspace.id,
  });

  // Push the new policy to this workspace's connected Actors rather than leaving it
  // for their next reconnect — for a long-lived agent that may be never, and the
  // whole point of the fail-mode knob is that it applies when the admin says so.
  // `pushActorConfigMany` skips the offline ones and bounds how many payloads are
  // built at once.
  const ws = getWSServerInstance();
  if (ws) {
    const actors = await ActorDAO.list({ workspaceId: id });
    void ws.pushActorConfigMany(actors.map((a) => a.did));
  }

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

export interface WorkspaceActionResult {
  error?: string;
}

/**
 * Deleting a workspace.
 *
 * A workspace is not just a label: it is a `CertScope` resource. Certificates
 * scoped to `workspace:<id>` keep verifying offline after the row is gone —
 * `packages/policy` checks a signature and an expiry, not whether the resource
 * named in the scope still exists — so a plain `DELETE` would leave live grants
 * pointing at a workspace no admin can open, revoke from, or even see. They are
 * therefore **revoked** first, in the same order and for the same reason
 * `deleteActorAction` uses: kill the grants, record what happened, then delete.
 * If the delete fails afterwards the workspace is still there with dead grants,
 * which is the safe direction to fail in.
 *
 * The default workspace is refused outright — `WorkspaceDAO.ensureDefault` would
 * recreate it at the next boot anyway, and everything that falls back to it would
 * be pointing at nothing until then.
 *
 * Actors are not deleted. `Actor.workspaceId` is `onDelete: SetNull`, so they
 * simply become unassigned; the count is named in the confirmation panel and
 * carried in the event, because "delete this workspace" reads like removing a
 * row and what it actually does is unfile everything in it.
 */
export async function deleteWorkspaceAction(formData: FormData): Promise<WorkspaceActionResult> {
  const performedBy = await requireAdmin();
  const id = formData.get("id") as string;
  const confirmation = ((formData.get("confirmName") as string) ?? "").trim();

  try {
    const workspace = await WorkspaceDAO.findById(id);
    if (!workspace) return { error: "Workspace not found" };
    if (workspace.isDefault) return { error: "The default workspace cannot be deleted" };
    if (confirmation !== workspace.name) {
      return { error: `Type the workspace name (${workspace.name}) to confirm deletion` };
    }

    // Collected before the delete: afterwards nothing records which certificates
    // were scoped here, and the scope-matched ones have no foreign key to follow.
    const scoped = await WorkspaceDAO.listActiveScopedCertificates(id);
    const actorCount = await WorkspaceDAO.countActors(id);

    const revokedCertIds: string[] = [];
    const holders = new Set<string>();
    for (const cert of scoped) {
      await CapabilityCertificateDAO.revoke(
        cert.id,
        performedBy.did,
        `Workspace ${workspace.name} (${id}) deleted`
      );
      revokedCertIds.push(cert.id);
      holders.add(cert.agentDid);
    }

    await recordEvent({
      eventType: "workspace.deleted",
      payload: {
        ...workspacePayload(workspace),
        unassignedActors: actorCount,
        affectedGrants: revokedCertIds.length,
        performedBy,
        adminUrl: buildAdminUrl("/admin/workspaces"),
      },
      performedBy,
      targetType: "workspace",
      targetId: id,
    });

    await WorkspaceDAO.delete(id);

    // Best-effort promptness, exactly as the custom-capability delete does it: the
    // revoked status is what actually decides the next `cert_status_request`, this
    // just saves connected holders from believing a dead grant until then.
    const ws = getWSServerInstance();
    for (const did of holders) {
      ws?.notifyCapabilitiesChanged(did, "certificate_revoked", revokedCertIds);
      void ws?.pushActorConfig(did);
    }

    revalidatePath("/admin/workspaces");
    revalidatePath("/admin/actors");
    revalidatePath("/admin");
    return {};
  } catch (err) {
    // Returned, not thrown: a production build redacts Server Action error
    // messages, so a throw would reach the admin as a minified React error.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
