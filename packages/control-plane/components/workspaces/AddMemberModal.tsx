"use client";

import { useEffect, useState } from "react";
import {
  adminApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { AgentInfo, WorkspaceDetail, UserListItem } from "@/lib/contracts";
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  type AssignableWorkspaceRole,
} from "@/lib/roles";
import { shortDid } from "@vaultysclaw/shared";

export function AddMemberModal({
  workspace,
  type,
  onClose,
  onAdded,
}: {
  workspace: WorkspaceDetail;
  type: "agent" | "user";
  onClose: () => void;
  onAdded: () => void;
}) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [role, setRole] = useState<AssignableWorkspaceRole>("Member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (type === "agent") {
      adminApi.agents
        .search()
        .then((r) => unwrap(r))
        .then((d) => setAgents(d.items));
    } else {
      adminApi.users
        .list({ query: { page: 1, pageSize: 1000 } })
        .then((r) => unwrap(r))
        .then((d) => setUsers(d.users ?? []));
    }
  }, [type]);

  // Filter out already-members (agents already carry their workspace array)
  const available =
    type === "agent"
      ? agents.filter((a) => !a.agentWorkspaces?.some((r) => r.workspaceId === workspace.id))
      : users;

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      if (type === "agent") {
        unwrap(
          await adminApi.workspaces.addAgent({
            params: { id: workspace.id },
            body: { agentDid: selected, isPrimary },
          })
        );
      } else {
        unwrap(
          await adminApi.workspaces.addUser({
            params: { id: workspace.id },
            body: { userDid: selected, isPrimary, role },
          })
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed");
      setSaving(false);
      return;
    }
    onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">
          Add {type === "agent" ? "Agent" : "User"}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Select {type}
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">— choose —</option>
              {available.map((item) => {
                const id =
                  type === "agent"
                    ? (item as AgentInfo).did
                    : (item as UserListItem).did;
                const label =
                  type === "agent"
                    ? (item as AgentInfo).name
                    : ((item as UserListItem).name ??
                      shortDid((item as UserListItem).did ?? ""));
                return (
                  <option key={id} value={id ?? ""}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          {type === "user" && (
            <div>
              <label className="block text-sm text-foreground-500 mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableWorkspaceRole)}
                className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {ASSIGNABLE_WORKSPACE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-foreground-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="accent-primary-600"
            />
            Set as primary workspace for this {type}
          </label>
          {error && <p className="text-danger-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-neutral-200 text-foreground-500 text-sm hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selected || saving}
              className="flex-1 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
