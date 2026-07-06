"use client";

import { shortDid, formatDate } from "@vaultysclaw/shared";
import type { UserListItem } from "@/lib/contracts";
import { userInitials } from "./userDisplay";

export type SortCol = "registeredAt" | "name" | "email";

function SortIndicator({
  col,
  sortBy,
  sortDir,
}: {
  col: SortCol;
  sortBy: string;
  sortDir: "asc" | "desc";
}) {
  if (sortBy !== col) return null;
  return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

export function RegisteredUsersTable({
  users,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
}: {
  users: UserListItem[];
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
  onRowClick: (user: UserListItem) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort("name")}
          >
            User
            <SortIndicator col="name" sortBy={sortBy} sortDir={sortDir} />
          </th>
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort("email")}
          >
            Email
            <SortIndicator col="email" sortBy={sortBy} sortDir={sortDir} />
          </th>
          <th className="px-5 py-3">DID</th>
          <th className="px-5 py-3">Role</th>
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort("registeredAt")}
          >
            Registered
            <SortIndicator
              col="registeredAt"
              sortBy={sortBy}
              sortDir={sortDir}
            />
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200">
        {users.map((u) => (
          <tr
            key={u.id}
            className="hover:bg-background-200/40 transition-colors cursor-pointer"
            onClick={() => onRowClick(u)}
          >
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary-600">
                    {userInitials(u)}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-foreground">
                    {u.name ?? (
                      <span className="text-foreground-400 italic font-normal">
                        Unnamed
                      </span>
                    )}
                  </span>
                  {u.workspaces.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {u.workspaces.map((r) => (
                        <span
                          key={r.workspaceId}
                          className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: r.workspace.color + "22",
                            color: r.workspace.color,
                            border: `1px solid ${r.workspace.color}44`,
                          }}
                        >
                          {r.workspace.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </td>
            <td className="px-5 py-3.5 text-foreground-500">
              {u.email ?? <span className="text-foreground-400">—</span>}
            </td>
            <td className="px-5 py-3.5 text-foreground-500 font-mono text-xs">
              <span title={u.did ?? ""}>{shortDid(u.did ?? undefined)}</span>
            </td>
            <td className="px-5 py-3.5">
              {u.role === "Owner" ? (
                <span className="px-2 py-0.5 bg-warning-100 text-warning-700 border border-warning-300 rounded-full text-xs font-medium">
                  Owner
                </span>
              ) : u.role === "Admin" ? (
                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 border border-primary-300 rounded-full text-xs font-medium">
                  Admin
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-background-200 text-foreground-500 border border-neutral-200 rounded-full text-xs font-medium">
                  Member
                </span>
              )}
            </td>
            <td className="px-5 py-3.5 text-foreground-500 text-xs">
              {formatDate(u.registeredAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
