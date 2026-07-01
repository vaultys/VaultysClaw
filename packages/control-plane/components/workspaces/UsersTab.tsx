"use client";

import { Crown, Plus, Users, X } from "lucide-react";
import { getInitials, shortDid } from "@vaultysclaw/shared";
import type { WorkspaceUserMember } from "./types";
import { EmptyState, ListCard, ListRow } from "./ui";
import {
  ASSIGNABLE_WORKSPACE_ROLES,
  normalizeWorkspaceRole,
  type WorkspaceRole,
} from "@/lib/roles";

export function UsersTab({
  users,
  canRemove,
  canManage,
  canTransferOwner,
  selfDid,
  onAdd,
  onRemove,
  onSetRole,
  onTransferOwner,
}: {
  users: WorkspaceUserMember[];
  canRemove: boolean;
  /** Viewer can add/remove members and change Admin/Member roles. */
  canManage: boolean;
  /** Viewer can transfer ownership (the current Owner). */
  canTransferOwner: boolean;
  /** DID of the viewer — used to prevent a workspace admin from managing themselves. */
  selfDid: string | null;
  onAdd: () => void;
  onRemove: (did: string) => void;
  onSetRole: (did: string, role: "Admin" | "Member") => void;
  onTransferOwner: (did: string) => void;
}) {
  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      )}
      {users.length === 0 ? (
        <EmptyState icon={Users} message="No users in this workspace." />
      ) : (
        <ListCard>
          {users.map((u, i) => {
            const userDid = u.user.did ?? u.user.id;
            const role = normalizeWorkspaceRole(u.role);
            const isOwner = role === "Owner";
            // A workspace admin cannot manage their own membership
            // (self-demote / self-remove).
            const isSelf = selfDid !== null && userDid === selfDid;
            const canManageRow = canManage && !isSelf;
            return (
              <ListRow key={userDid} index={i}>
                <div className="w-8 h-8 rounded-full bg-background-200 border border-neutral-200 flex items-center justify-center shrink-0 text-xs font-semibold text-foreground-500">
                  {getInitials(u.user.name ?? shortDid(userDid))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {u.user.name ?? shortDid(userDid)}
                    </span>
                    {isOwner && (
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-warning-50 text-warning-700">
                        <Crown className="w-3 h-3" /> owner
                      </span>
                    )}
                    {u.isPrimary && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warning-50 text-warning-700">
                        primary
                      </span>
                    )}
                  </div>
                  {u.user.email && (
                    <p className="text-xs text-foreground-400 truncate">
                      {u.user.email}
                    </p>
                  )}
                </div>

                {/* Role: editable select for non-owners, static label for the owner */}
                {isOwner ? (
                  <span className="text-xs text-foreground-400 px-1.5">Owner</span>
                ) : canManageRow ? (
                  <select
                    value={role}
                    onChange={(e) =>
                      onSetRole(userDid, e.target.value as "Admin" | "Member")
                    }
                    className="text-xs bg-background-100 border border-neutral-200 text-foreground-500 rounded-lg px-2 py-1 focus:outline-none focus:border-primary-500"
                  >
                    {ASSIGNABLE_WORKSPACE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-foreground-400 px-1.5">{role}</span>
                )}

                {canTransferOwner && !isOwner && !isSelf && (
                  <button
                    onClick={() => onTransferOwner(userDid)}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-warning-600 hover:bg-warning-400/10 transition-colors"
                    title="Transfer ownership to this user"
                  >
                    <Crown className="w-4 h-4" />
                  </button>
                )}

                {canManageRow && canRemove && !isOwner && (
                  <button
                    onClick={() => onRemove(userDid)}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                    title="Remove from workspace"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </div>
  );
}
