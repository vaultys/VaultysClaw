"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Globe, Plus, X, Crown, Star } from "lucide-react";
import { workspacesClient, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import type {
  WorkspaceWithCounts,
  UserDetail,
  UserWorkspaceWithWorkspace,
} from "@/lib/contracts";
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  normalizeWorkspaceRole,
  type AssignableWorkspaceRole,
} from "@/lib/roles";

export function UserWorkspacesTab({
  user,
  isOwner,
}: {
  user: UserDetail;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [userWorkspaces, setUserWorkspaces] = useState<UserWorkspaceWithWorkspace[]>([]);
  const [available, setAvailable] = useState<WorkspaceWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingWorkspaceId, setAddingWorkspaceId] = useState("");
  const [addRole, setAddRole] = useState<AssignableWorkspaceRole>("Member");
  const [addAsPrimary, setAddAsPrimary] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = unwrap(
        await workspacesClient.list({ query: { userId: user.id } })
      );
      const res2 = unwrap(await workspacesClient.listMyWorkspaces());
      setUserWorkspaces(res2.userWorkspaces);
      setAvailable(res.workspaces);
    } catch {
      setError("Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, [user.did]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!addingWorkspaceId) return;
    setAdding(true);
    setAddError(null);
    try {
      unwrap(
        await workspacesClient.addUser({
          params: { id: addingWorkspaceId },
          body: {
            userDid: user.did!,
            isPrimary: addAsPrimary,
            role: addRole,
          },
        })
      );
      setAddingWorkspaceId("");
      setAddRole("Member");
      setAddAsPrimary(false);
      load();
    } catch (err) {
      setAddError(
        err instanceof ApiError ? err.message : "Failed to add to workspace"
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (workspaceId: string) => {
    setBusy(workspaceId + ":remove");
    try {
      unwrap(
        await workspacesClient.removeUser({
          params: { id: workspaceId },
          body: { userDid: user.did! },
        })
      );
      load();
    } catch (err) {
      alert(
        err instanceof ApiError ? err.message : "Failed to remove from workspace"
      );
    } finally {
      setBusy(null);
    }
  };

  const handleSetRole = async (
    workspaceId: string,
    role: AssignableWorkspaceRole
  ) => {
    setBusy(workspaceId + ":role");
    try {
      unwrap(
        await workspacesClient.updateUser({
          params: { id: workspaceId },
          body: { userDid: user.did!, role },
        })
      );
      load();
    } catch (err) {
      alert(
        err instanceof ApiError ? err.message : "Failed to update workspace role"
      );
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">
          Workspace memberships
        </h2>
        <p className="text-xs text-foreground-500">
          Workspaces this user belongs to. Workspace admins can manage agents and
          settings within their workspace.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-danger-500 text-sm bg-danger-50 border border-danger-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {userWorkspaces.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-foreground-500 gap-2">
          <Globe size={32} strokeWidth={1} />
          <p className="text-sm">Not a member of any workspace yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
          {userWorkspaces.map((ur) => (
            <div
              key={ur.workspaceId}
              className="flex items-center gap-3 px-4 py-3 bg-background-100 hover:bg-background-200 transition-colors"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: ur.workspace.color ?? "#6366f1" }}
              />
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => router.push(`/app/workspaces/${ur.workspaceId}`)}
                  className="text-sm font-medium text-foreground hover:text-primary-400 transition-colors truncate block"
                >
                  {ur.workspace.name}
                </button>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {ur.workspace.isDefault && (
                    <span className="text-xs text-foreground-400">Default</span>
                  )}
                  {ur.isPrimary && (
                    <span className="flex items-center gap-1 text-xs text-warning-600">
                      <Star size={10} className="fill-current" /> Primary
                    </span>
                  )}
                  {normalizeWorkspaceRole(ur.role) === "Owner" && (
                    <span className="flex items-center gap-1 text-xs text-warning-600">
                      <Crown size={10} /> Owner
                    </span>
                  )}
                </div>
              </div>

              {isOwner && (
                <div className="flex items-center gap-2 shrink-0">
                  {normalizeWorkspaceRole(ur.role) === "Owner" ? (
                    <span className="text-xs text-foreground-400 px-2.5 py-1.5">
                      Owner
                    </span>
                  ) : (
                    <select
                      value={normalizeWorkspaceRole(ur.role)}
                      onChange={(e) =>
                        handleSetRole(
                          ur.workspaceId,
                          e.target.value as AssignableWorkspaceRole
                        )
                      }
                      disabled={busy === ur.workspaceId + ":role"}
                      className="text-xs bg-background-100 border border-neutral-300 text-foreground-500 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                    >
                      {ASSIGNABLE_WORKSPACE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                  {!ur.workspace.isDefault &&
                    normalizeWorkspaceRole(ur.role) !== "Owner" && (
                    <button
                      onClick={() => handleRemove(ur.workspaceId)}
                      disabled={busy === ur.workspaceId + ":remove"}
                      title="Remove from workspace"
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 text-foreground-500 hover:border-danger-400 hover:text-danger-500 transition-colors disabled:opacity-50"
                    >
                      <X size={12} />
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && available.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
            Add to workspace
          </h3>
          <div className="bg-background-200 border border-neutral-200 rounded-xl p-4 space-y-3">
            <select
              value={addingWorkspaceId}
              onChange={(e) => setAddingWorkspaceId(e.target.value)}
              className="w-full bg-background-100 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            >
              <option value="">— Select a workspace —</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                Role
                <select
                  value={addRole}
                  onChange={(e) =>
                    setAddRole(e.target.value as AssignableWorkspaceRole)
                  }
                  className="bg-background-100 border border-neutral-300 text-foreground text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-500"
                >
                  {ASSIGNABLE_WORKSPACE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={addAsPrimary}
                  onChange={(e) => setAddAsPrimary(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                Primary workspace
              </label>
            </div>

            {addError && (
              <div className="flex items-center gap-2 text-danger-500 text-xs">
                <AlertCircle size={12} />
                {addError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleAdd}
                disabled={!addingWorkspaceId || adding}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-4 py-2 rounded-xl transition-colors"
              >
                <Plus size={14} />
                {adding ? "Adding…" : "Add to workspace"}
              </button>
            </div>
          </div>
        </section>
      )}

      {isOwner && available.length === 0 && userWorkspaces.length > 0 && (
        <p className="text-xs text-foreground-400">
          This user is already a member of all workspaces.
        </p>
      )}
    </div>
  );
}
