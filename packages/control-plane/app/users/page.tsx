"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import InviteUserModal from "@/components/users/InviteUserModal";
import { Users, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

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
  role: string;
  registeredAt: string;
  realms?: UserRealm[];
}

interface ApiResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `${did.slice(0, 14)}…${did.slice(-6)}`;
}

function initials(user: User): string {
  if (user.name) return user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return user.did.slice(-2).toUpperCase();
}

const ROLES = ["", "owner", "admin", "manager", "operator", "member"] as const;

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"registeredAt" | "name" | "email">("registeredAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUsers = useCallback(async (params: {
    q: string; role: string; page: number; sortBy: string; sortDir: string;
  }) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(params.page),
        pageSize: String(PAGE_SIZE),
        sortBy: params.sortBy,
        sortDir: params.sortDir,
      });
      if (params.q) sp.set("q", params.q);
      if (params.role) sp.set("role", params.role);
      const res = await fetch(`/api/users?${sp}`);
      if (res.status === 403) { window.location.href = "/"; return; }
      const data = await res.json() as ApiResponse;
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadUsers({ q, role, page, sortBy, sortDir });
    }, q ? 300 : 0);
  }, [q, role, page, sortBy, sortDir, loadUsers]);

  const handleSort = (col: "registeredAt" | "name" | "email") => {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const SortIndicator = ({ col }: { col: string }) =>
    sortBy === col ? <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span> : null;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-vc-text">Users</h1>
          <p className="text-vc-muted text-sm mt-0.5">
            {loading ? "Loading…" : `${total} registered`}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + Invite User
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-vc-subtle" />
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search name, email or DID…"
            className="w-full pl-9 pr-8 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {q && (
            <button onClick={() => { setQ(""); setPage(1); }} className="absolute right-2.5 top-2.5 text-vc-subtle hover:text-vc-text">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Role filter */}
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All roles</option>
          {ROLES.filter(Boolean).map((r) => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => {
            const [col, dir] = e.target.value.split(":") as [typeof sortBy, typeof sortDir];
            setSortBy(col); setSortDir(dir); setPage(1);
          }}
          className="px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="registeredAt:asc">Registered (oldest)</option>
          <option value="registeredAt:desc">Registered (newest)</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="email:asc">Email A–Z</option>
        </select>
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
            <p className="text-vc-muted">{q || role ? "No users match your filters" : "No users yet."}</p>
            {(q || role) && (
              <button onClick={() => { setQ(""); setRole(""); setPage(1); }} className="text-indigo-500 text-sm mt-2 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vc-border text-left text-xs font-medium text-vc-subtle uppercase tracking-wider">
                    <th className="px-5 py-3 cursor-pointer select-none hover:text-vc-text" onClick={() => handleSort("name")}>
                      User<SortIndicator col="name" />
                    </th>
                    <th className="px-5 py-3 cursor-pointer select-none hover:text-vc-text" onClick={() => handleSort("email")}>
                      Email<SortIndicator col="email" />
                    </th>
                    <th className="px-5 py-3">DID</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3 cursor-pointer select-none hover:text-vc-text" onClick={() => handleSort("registeredAt")}>
                      Registered<SortIndicator col="registeredAt" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vc-border">
                  {users.map((u) => (
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
                                    style={{ backgroundColor: r.color + "22", color: r.color, border: `1px solid ${r.color}44` }}
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
                          <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800 rounded-full text-xs font-medium">Owner</span>
                        ) : u.isAdmin ? (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800 rounded-full text-xs font-medium">Admin</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-vc-raised text-vc-muted border border-vc-border rounded-full text-xs font-medium capitalize">{u.role || "Member"}</span>
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
            <div className="flex items-center justify-between px-5 py-3 border-t border-vc-border">
              <p className="text-xs text-vc-subtle">
                {total === 0 ? "0 results" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-vc-muted hover:text-vc-text hover:bg-vc-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const half = 3;
                  let start = Math.max(1, page - half);
                  const end = Math.min(totalPages, start + 6);
                  start = Math.max(1, end - 6);
                  return start + i;
                }).filter((p) => p >= 1 && p <= totalPages).map((p) => (
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
          </>
        )}
      </div>

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => { setShowInvite(false); loadUsers({ q, role, page, sortBy, sortDir }); }}
        />
      )}
    </div>
  );
}
