"use client";

import { QrCode, Send, Loader2 } from "lucide-react";
import { formatDate } from "@vaultysclaw/shared";
import type { UserListItem } from "@/lib/contracts";
import { userInitials } from "./userDisplay";
import type { SortCol } from "./RegisteredUsersTable";

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

export function UnclaimedUsersTable({
  users,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
  smtpAvailable,
  sendingQr,
  onGenerateQr,
}: {
  users: UserListItem[];
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
  onRowClick: (user: UserListItem) => void;
  smtpAvailable: boolean;
  sendingQr: string | null;
  onGenerateQr: (user: UserListItem, sendByEmail: boolean) => void;
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
          <th className="px-5 py-3">Source</th>
          <th className="px-5 py-3">Role</th>
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort("registeredAt")}
          >
            Provisioned
            <SortIndicator
              col="registeredAt"
              sortBy={sortBy}
              sortDir={sortDir}
            />
          </th>
          <th className="px-5 py-3">Claim</th>
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
                <div className="w-8 h-8 rounded-full bg-warning-100 border border-warning-300 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-warning-600">
                    {userInitials(u)}
                  </span>
                </div>
                <span className="font-medium text-foreground">
                  {u.name ?? (
                    <span className="text-foreground-400 italic font-normal">
                      Unnamed
                    </span>
                  )}
                </span>
              </div>
            </td>
            <td className="px-5 py-3.5 text-foreground-500">
              {u.email ?? <span className="text-foreground-400">—</span>}
            </td>
            <td className="px-5 py-3.5">
              {u.entraId ? (
                <span className="px-2 py-0.5 bg-primary-50 text-primary-600 border border-primary-200 rounded-full text-xs font-medium">
                  Entra ID
                </span>
              ) : (
                <span className="text-foreground-400 text-xs">—</span>
              )}
            </td>
            <td className="px-5 py-3.5">
              <span className="px-2 py-0.5 bg-background-200 text-foreground-500 border border-neutral-200 rounded-full text-xs font-medium capitalize">
                {u.role || "Member"}
              </span>
            </td>
            <td className="px-5 py-3.5 text-foreground-500 text-xs">
              {formatDate(u.registeredAt)}
            </td>
            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onGenerateQr(u, false)}
                  disabled={sendingQr === u.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition-colors"
                  title="Show QR code"
                >
                  {sendingQr === u.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <QrCode className="w-3 h-3" />
                  )}
                  QR
                </button>
                {u.email && smtpAvailable && (
                  <button
                    onClick={() => onGenerateQr(u, true)}
                    disabled={sendingQr === u.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-background-200 border border-neutral-300 hover:border-primary-500 text-foreground disabled:opacity-40 transition-colors"
                    title="Send by email"
                  >
                    <Send className="w-3 h-3" />
                    Email
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
