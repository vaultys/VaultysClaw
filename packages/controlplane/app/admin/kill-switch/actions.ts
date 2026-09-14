"use server";

/**
 * Arming and disarming kill switches — one implementation for both scopes.
 *
 * The global switch (`/admin/settings`) and a workspace's (`/admin/workspaces/[id]`)
 * differ only in which row they write, so they share these actions rather than
 * two near-identical copies that could drift on the confirmation rules or the
 * audit payload. `scope` in the form data says which.
 *
 * What these do *not* do is touch `CapabilityCertificate`. See `lib/kill-switch.ts`.
 */
import { revalidatePath } from "next/cache";
import { KillSwitchDAO, GLOBAL_KILL_SWITCH_ID, WorkspaceDAO } from "@/db";
import { recordEvent } from "@/lib/audit";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateKillSwitchCache } from "@/lib/kill-switch";
import { buildAdminUrl, killSwitchPayload } from "@/lib/webhook-payloads";
import { getWSServerInstance } from "@/lib/ws-server";

/** The typed confirmation an admin must produce to arm. Short and fixed rather
 *  than a name to copy — this is an emergency control, and the point of the
 *  confirmation is to stop a misplaced click, not to slow down a real incident. */
const ARM_CONFIRMATION = "ARM";

interface Target {
  id: string;
  scopeType: "global" | "workspace";
  workspaceId: string | null;
  workspaceName: string | null;
  revalidate: string;
}

async function resolveTarget(formData: FormData): Promise<Target> {
  const scope = formData.get("scope") as string;
  if (scope === "global") {
    return {
      id: GLOBAL_KILL_SWITCH_ID,
      scopeType: "global",
      workspaceId: null,
      workspaceName: null,
      revalidate: "/admin/settings",
    };
  }
  if (scope !== "workspace") throw new Error("Scope must be 'global' or 'workspace'");

  const workspaceId = (formData.get("workspaceId") as string)?.trim();
  if (!workspaceId) throw new Error("A workspace is required for a workspace-scoped kill switch");
  const workspace = await WorkspaceDAO.findById(workspaceId);
  if (!workspace) throw new Error("Workspace not found");

  return {
    id: workspace.id,
    scopeType: "workspace",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    revalidate: `/admin/workspaces/${workspace.id}`,
  };
}

export async function armKillSwitchAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();

  const reason = (formData.get("reason") as string)?.trim();
  if (!reason) throw new Error("A reason is required to arm a kill switch");
  if ((formData.get("confirm") as string)?.trim() !== ARM_CONFIRMATION) {
    throw new Error(`Type ${ARM_CONFIRMATION} to confirm`);
  }

  const target = await resolveTarget(formData);
  const row = await KillSwitchDAO.arm({
    id: target.id,
    scopeType: target.scopeType,
    workspaceId: target.workspaceId,
    reason,
    armedBy: performedBy.did,
  });

  // Before the push, not after: the WS server reads the armed set through the
  // same cache, and pushing first would have it compute "who is covered"
  // from state that does not yet include this switch.
  invalidateKillSwitchCache();

  const affectedActors = (await getWSServerInstance()?.notifyKillSwitchArmed(row)) ?? 0;

  await recordEvent({
    eventType: "killswitch.armed",
    payload: {
      ...killSwitchPayload(row, { workspaceName: target.workspaceName, affectedActors }),
      performedBy,
      adminUrl: buildAdminUrl(target.revalidate),
    },
    performedBy,
    targetType: target.scopeType === "workspace" ? "workspace" : null,
    targetId: target.workspaceId,
  });

  // The armed banner is rendered by the admin layout, so every admin route's
  // cached render is now stale, not just this page's.
  revalidatePath("/admin", "layout");
}

export async function disarmKillSwitchAction(formData: FormData): Promise<void> {
  const performedBy = await requireAdmin();
  const target = await resolveTarget(formData);

  const row = await KillSwitchDAO.disarm(target.id);
  // Already disarmed — someone else got there first. Not an error worth throwing
  // in an incident: the state the admin wanted is the state that exists.
  if (!row) {
    revalidatePath("/admin", "layout");
    return;
  }

  // Covered Actors are refused at the handshake until this lands, so a stale
  // cache here means turning away clients the admin has already released.
  invalidateKillSwitchCache();

  await recordEvent({
    eventType: "killswitch.disarmed",
    payload: {
      ...killSwitchPayload(row, { workspaceName: target.workspaceName }),
      performedBy,
      adminUrl: buildAdminUrl(target.revalidate),
    },
    performedBy,
    targetType: target.scopeType === "workspace" ? "workspace" : null,
    targetId: target.workspaceId,
  });

  // Nothing to push: the covered Actors are disconnected and reconnect on their
  // own now that the handshake stops refusing them.
  revalidatePath("/admin", "layout");
}
