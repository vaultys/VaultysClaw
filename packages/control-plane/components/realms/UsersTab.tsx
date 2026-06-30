"use client";

import { Plus, Users, X } from "lucide-react";
import { getInitials, shortDid } from "@vaultysclaw/shared";
import type { RealmUserMember } from "./types";
import { EmptyState, ListCard, ListRow } from "./ui";

export function UsersTab({
  users,
  canRemove,
  onAdd,
  onRemove,
}: {
  users: RealmUserMember[];
  canRemove: boolean;
  onAdd: () => void;
  onRemove: (did: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>
      {users.length === 0 ? (
        <EmptyState icon={Users} message="No users in this realm." />
      ) : (
        <ListCard>
          {users.map((u, i) => {
            const userDid = u.user.did ?? u.user.id;
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
                {canRemove && (
                  <button
                    onClick={() => onRemove(userDid)}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                    title="Remove from realm"
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
