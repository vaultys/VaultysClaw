"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Plus, Star, Trash2, Users, Bot, GitFork } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  adminApi,
  userApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { WorkspaceWithCounts } from "@/lib/contracts";
import { normalizeWorkspaceRole } from "@/lib/roles";
import { slugify } from "@vaultysclaw/shared";

const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#06b6d4",
];

function CreateWorkspaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const slug = slugify(name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      unwrap(
        await adminApi.workspaces.create({
          body: {
            name: name.trim(),
            slug,
            description: description.trim(),
            color,
          },
        })
      );
      onCreated();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create workspace"
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">
          Create Workspace
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Engineering, Sales, EU Office…"
            />
            {name && (
              <p className="text-foreground-400 text-xs mt-1">
                slug: <code className="font-mono">{slug}</code>
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-2">
              Accent color
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "white" : "transparent",
                    boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded-full border border-neutral-200 cursor-pointer bg-transparent"
                title="Custom color"
              />
            </div>
          </div>
          {error && <p className="text-danger-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-neutral-200 text-foreground-500 text-sm hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WorkspacesPage() {
  const router = useRouter();
  const { isGlobalAdmin } = useRole();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Workspaces the current user owns — the only ones they may delete.
  const [ownedWorkspaceIds, setOwnedWorkspaceIds] = useState<Set<string>>(
    new Set()
  );

  const load = useCallback(async () => {
    const [{ workspaces }, { userWorkspaces }] = await Promise.all([
      unwrap(await userApi.workspaces.list()),
      unwrap(await userApi.workspaces.listMyWorkspaces()),
    ]);
    setWorkspaces(workspaces);
    setOwnedWorkspaceIds(
      new Set(
        userWorkspaces
          .filter((r) => normalizeWorkspaceRole(r.role) === "Owner")
          .map((r) => r.workspaceId)
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSetDefault(id: string) {
    unwrap(await adminApi.workspaces.setDefault({ params: { id } }));
    load();
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Delete this workspace? Members will be removed from it. This cannot be undone."
      )
    )
      return;
    setDeletingId(id);
    unwrap(await userApi.workspaces.remove({ params: { id } }));
    setDeletingId(null);
    load();
  }

  useBreadcrumbs([{ label: "Workspaces" }], []);

  useToolbar(
    {
      title: "Workspaces",
      description: loading
        ? "Loading…"
        : `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""}`,
      actions: isGlobalAdmin
        ? [
            {
              kind: "button",
              id: "create",
              label: "New Workspace",
              variant: "primary",
              icon: <Plus className="w-3.5 h-3.5" />,
              onClick: () => setShowCreate(true),
            },
          ]
        : [],
    },
    [loading, workspaces.length, isGlobalAdmin]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Workspace cards grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Globe2 className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-foreground-500">No workspaces yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              onClick={() => router.push(`/app/workspaces/${workspace.id}`)}
              className="bg-background-100 border border-neutral-200 rounded-2xl overflow-clip p-5 cursor-pointer hover:border-primary-500/50 transition-all group relative"
            >
              {/* Color accent strip */}
              <div
                className="absolute top-0 left-0 right-0 h-2"
                style={{ backgroundColor: workspace.color }}
              />

              <div className="flex items-start justify-between mb-3 mt-1">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: workspace.color + "22",
                      border: `1px solid ${workspace.color}44`,
                    }}
                  >
                    <Globe2
                      className="w-4 h-4"
                      style={{ color: workspace.color }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground text-sm">
                        {workspace.name}
                      </span>
                      {workspace.isDefault && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-warning-50 text-warning-700 font-medium">
                          default
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-foreground-400 font-mono">
                      {workspace.slug}
                    </code>
                  </div>
                </div>
              </div>

              {workspace.description && (
                <p className="text-foreground-500 text-xs mb-3 line-clamp-2">
                  {workspace.description}
                </p>
              )}

              {/* Member counts */}
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <Bot className="w-3.5 h-3.5" />
                  {workspace._count?.agentWorkspaces ?? 0}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <Users className="w-3.5 h-3.5" />
                  {workspace._count?.userWorkspaces ?? 0}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <GitFork className="w-3.5 h-3.5" />
                  {workspace._count?.workflows ?? 0}
                </span>
              </div>

              <p className="text-foreground-400 text-xs">
                Created {new Date(workspace.createdAt).toLocaleDateString()}
              </p>

              {/* Actions — "set default" is a global-admin (org-level) action;
                  deleting a workspace requires being its owner. */}
              {(() => {
                const canDelete =
                  !workspace.isDefault && ownedWorkspaceIds.has(workspace.id);
                const canSetDefault = isGlobalAdmin && !workspace.isDefault;
                if (!canDelete && !canSetDefault) return null;
                return (
                  <div
                    className="flex gap-1 mt-3 pt-3 border-t border-neutral-200/50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canSetDefault && (
                      <button
                        onClick={() => handleSetDefault(workspace.id)}
                        title="Set as default"
                        className="p-1.5 rounded-lg text-foreground-500 hover:text-warning-400 hover:bg-warning-400/10 transition-colors"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(workspace.id)}
                        disabled={deletingId === workspace.id}
                        title="Delete workspace"
                        className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors ml-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
