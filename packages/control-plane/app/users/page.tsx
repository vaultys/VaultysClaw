"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import InviteUserModal from "@/components/users/InviteUserModal";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";

interface UserRealm {
  id: string;
  name: string;
  slug: string;
  color: string;
  isPrimary: boolean;
}

interface User {
  did: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  registeredAt: string;
  realms?: UserRealm[];
}

const PAGE_SIZE = 10;

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 14)}…${did.slice(-6)}`;
}

function initials(user: User): string {
  if (user.name) return user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return user.did.slice(-2).toUpperCase();
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [page, setPage] = useState(1);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.status === 403) { window.location.href = "/"; return; }
    const data = await res.json() as { users: User[] };
    setUsers(data.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const paginated = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-vc-text">Users</h1>
          <p className="text-vc-muted text-sm mt-0.5">
            {loading ? "Loading…" : `${users.length} registered`}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + Invite User
        </button>
      </div>

      {/* Table */}
      <div className="bg-vc-surface border border-vc-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Users className="w-10 h-10 text-vc-ring mb-3" />
            <p className="text-vc-muted">No users yet.</p>
            <p className="text-vc-subtle text-sm mt-1">Invite a user to get started.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vc-border text-left text-xs font-medium text-vc-subtle uppercase tracking-wider">
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">DID</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vc-border">
                  {paginated.map((u) => (
                    <tr
                      key={u.did}
                      className="hover:bg-vc-raised/40 transition-colors cursor-pointer"
                      onClick={() => router.push(`/users/${encodeURIComponent(u.did)}`)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700/50 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{initials(u)}</span>
                          </div>
                          <div>
                            <span className="font-medium text-vc-text">
                              {u.name ?? <span className="text-vc-subtle italic font-normal">Unnamed</span>}
                            </span>
                            {u.realms && u.realms.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {u.realms.map((r) => (
                                  <span
                                    key={r.id}
                                    className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md"
                                    style={{
                                      backgroundColor: r.color + "22",
                                      color: r.color,
                                      border: `1px solid ${r.color}44`,
                                    }}
                                  >
                                    {r.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-vc-muted">
                        {u.email ?? <span className="text-vc-subtle">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-vc-muted font-mono text-xs">
                        <span title={u.did}>{shortDid(u.did)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {u.isOwner ? (
                          <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800 rounded-full text-xs font-medium">
                            Owner
                          </span>
                        ) : u.isAdmin ? (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800 rounded-full text-xs font-medium">
                            Admin
                          </span>
                        ) : (
                          <span className="text-vc-subtle text-xs">Member</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-vc-muted text-xs">
                        {new Date(u.registeredAt + (u.registeredAt.endsWith("Z") ? "" : "Z")).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-vc-border">
                <p className="text-xs text-vc-subtle">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, users.length)} of {users.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-vc-muted hover:text-vc-text hover:bg-vc-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${p === page
                        ? "bg-indigo-600 text-white"
                        : "text-vc-muted hover:text-vc-text hover:bg-vc-raised"
                        }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-vc-muted hover:text-vc-text hover:bg-vc-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => { setShowInvite(false); loadUsers(); }}
        />
      )}
    </div>
  );
}


