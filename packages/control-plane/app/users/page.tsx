"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import InviteUserModal from "@/components/users/InviteUserModal";
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  QrCode,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  UserCheck,
  Clock,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRealm {
  id: string;
  name: string;
  slug: string;
  color: string;
  isPrimary: boolean;
}

interface User {
  id: string;
  did: string | null;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  role: string;
  registeredAt: string;
  entraId?: string | null;
  claimedAt?: string | null;
  realms?: UserRealm[];
}

interface ApiResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type Tab = "registered" | "unregistered";

const PAGE_SIZE = 20;
const ROLES = ["", "owner", "admin", "manager", "operator", "member"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortDid(did: string | null): string {
  if (!did) return "—";
  if (did.length <= 24) return did;
  return `${did.slice(0, 14)}…${did.slice(-6)}`;
}

function initials(user: User): string {
  if (user.name)
    return user.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  if (user.did) return user.did.slice(-2).toUpperCase();
  if (user.email) return user.email.slice(0, 2).toUpperCase();
  return "??";
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter();

  // Tab
  const [tab, setTab] = useState<Tab>("registered");

  // Data
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // QR flow
  const [smtpAvailable, setSmtpAvailable] = useState(false);
  const [sendingQr, setSendingQr] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<{
    user: User;
    qrUrl: string;
    token: string;
    phase: "showing" | "success" | "failure";
  } | null>(null);

  // Filters (shared across tabs)
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"registeredAt" | "name" | "email">(
    "registeredAt"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/server/smtp")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { host?: string } | null) => setSmtpAvailable(Boolean(d?.host)))
      .catch(() => {});
  }, []);

  const loadUsers = useCallback(
    async (params: {
      tab: Tab;
      q: string;
      role: string;
      page: number;
      sortBy: string;
      sortDir: string;
    }) => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({
          page: String(params.page),
          pageSize: String(PAGE_SIZE),
          sortBy: params.sortBy,
          sortDir: params.sortDir,
          hasAccount: params.tab === "registered" ? "true" : "false",
        });
        if (params.q) sp.set("q", params.q);
        if (params.role) sp.set("role", params.role);
        const res = await fetch(`/api/users?${sp}`);
        if (res.status === 403) {
          window.location.href = "/";
          return;
        }
        const data = (await res.json()) as ApiResponse;
        setUsers(data.users ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => {
        loadUsers({ tab, q, role, page, sortBy, sortDir });
      },
      q ? 300 : 0
    );
  }, [tab, q, role, page, sortBy, sortDir, loadUsers]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setQ("");
    setRole("");
  };

  const handleSort = (col: "registeredAt" | "name" | "email") => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const SortIndicator = ({ col }: { col: string }) =>
    sortBy === col ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  const generateQr = async (user: User, sendByEmail: boolean) => {
    setSendingQr(user.id);
    try {
      if (sendByEmail) {
        // Send email invitation
        const r = await fetch("/api/users/invite/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            name: user.name,
            role: user.role,
          }),
        });
        const d = (await r.json()) as {
          token?: string;
          userId?: string;
          error?: string;
        };
        if (!r.ok) {
          alert(d.error ?? "Failed to send invitation");
          return;
        }
        alert(`Invitation sent to ${user.email}`);
        loadUsers({ tab, q, role, page, sortBy, sortDir });
      } else {
        // Show direct QR code
        const [inviteRes, settingsRes] = await Promise.all([
          fetch("/api/users/invite"),
          fetch("/api/server/settings"),
        ]);
        if (!inviteRes.ok) throw new Error("Failed to create invite");

        const data = (await inviteRes.json()) as {
          connectionString: string;
          token: string;
          key: string;
          serverDid: string | null;
        };
        const { walletUrl } = (await settingsRes.json()) as {
          walletUrl?: string;
        };
        const base = walletUrl ?? "https://wallet.vaultys.net";
        const didParam = data.serverDid
          ? `&did=${encodeURIComponent(data.serverDid)}`
          : "";
        const qrUrl = `${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`;

        setQrModal({ user, qrUrl, token: data.token, phase: "showing" });

        // Poll until done
        for (let i = 0; i < 180; i++) {
          await new Promise((res) => setTimeout(res, 1500));
          const pr = await fetch(`/api/user/listen/${data.token}`);
          const { status } = (await pr.json()) as { status: number };
          if (status === 2) {
            setQrModal((m) => (m ? { ...m, phase: "success" } : null));
            loadUsers({ tab, q, role, page, sortBy, sortDir });
            return;
          }
          if (status === -2) {
            setQrModal((m) => (m ? { ...m, phase: "failure" } : null));
            return;
          }
        }
      }
    } finally {
      setSendingQr(null);
    }
  };

  const emptyMessage =
    q || role
      ? "No users match your filters"
      : tab === "registered"
        ? "No registered users yet."
        : "No unclaimed users.";

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Users</h1>
          <p className="text-foreground-500 text-sm mt-0.5">
            {loading
              ? "Loading…"
              : `${total} ${tab === "registered" ? "registered" : "unclaimed"}`}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-primary-600 hover:bg-primary-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + Invite User
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-background-200 border border-neutral-200 rounded-xl p-1 w-fit">
        <button
          onClick={() => switchTab("registered")}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "registered"
              ? "bg-background-100 shadow text-foreground border border-neutral-200"
              : "text-foreground-500 hover:text-foreground"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Registered
        </button>
        <button
          onClick={() => switchTab("unregistered")}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "unregistered"
              ? "bg-background-100 shadow text-foreground border border-neutral-200"
              : "text-foreground-500 hover:text-foreground"
          }`}
        >
          <Clock className="w-4 h-4" />
          Unclaimed
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-2.5 text-foreground-400"
          />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={
              tab === "registered"
                ? "Search name, email or DID…"
                : "Search name or email…"
            }
            className="w-full pl-9 pr-8 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                setPage(1);
              }}
              className="absolute right-2.5 top-2.5 text-foreground-400 hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {tab === "registered" && (
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All roles</option>
            {ROLES.filter(Boolean).map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        )}

        <select
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => {
            const [col, dir] = e.target.value.split(":") as [
              typeof sortBy,
              typeof sortDir,
            ];
            setSortBy(col);
            setSortDir(dir);
            setPage(1);
          }}
          className="px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="registeredAt:asc">Provisioned (oldest)</option>
          <option value="registeredAt:desc">Provisioned (newest)</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="email:asc">Email A–Z</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Users className="w-10 h-10 text-neutral-300 mb-3" />
            <p className="text-foreground-500">{emptyMessage}</p>
            {(q || role) && (
              <button
                onClick={() => {
                  setQ("");
                  setRole("");
                  setPage(1);
                }}
                className="text-primary-500 text-sm mt-2 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              {tab === "registered" ? (
                <RegisteredTable
                  users={users}
                  sortBy={sortBy}
                  SortIndicator={SortIndicator}
                  handleSort={handleSort}
                  router={router}
                />
              ) : (
                <UnclaimedTable
                  users={users}
                  sortBy={sortBy}
                  SortIndicator={SortIndicator}
                  handleSort={handleSort}
                  router={router}
                  smtpAvailable={smtpAvailable}
                  sendingQr={sendingQr}
                  generateQr={generateQr}
                />
              )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200">
              <p className="text-xs text-foreground-400">
                {total === 0
                  ? "0 results"
                  : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let start = Math.max(1, page - 3);
                  const end = Math.min(totalPages, start + 6);
                  start = Math.max(1, end - 6);
                  return start + i;
                })
                  .filter((p) => p >= 1 && p <= totalPages)
                  .map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${
                        p === page
                          ? "bg-primary-600 text-white"
                          : "text-foreground-500 hover:text-foreground hover:bg-background-200"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
          onSuccess={() => {
            setShowInvite(false);
            loadUsers({ tab, q, role, page, sortBy, sortDir });
          }}
        />
      )}

      {/* QR claim modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Claim Account</h3>
                <p className="text-xs text-foreground-500 mt-0.5">
                  {qrModal.user.name ?? qrModal.user.email ?? "Unknown user"}
                </p>
              </div>
              <button
                onClick={() => setQrModal(null)}
                className="p-1 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {qrModal.phase === "showing" && (
              <>
                <p className="text-xs text-foreground-500 text-center">
                  Scan this QR code with the Vaultys wallet to activate the
                  account.
                </p>
                <div className="flex justify-center p-4 bg-background rounded-xl">
                  <QRCodeSVG value={qrModal.qrUrl} size={200} />
                </div>
                <div className="flex items-center gap-2 text-xs text-foreground-400">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  Waiting for wallet scan…
                </div>
              </>
            )}

            {qrModal.phase === "success" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle className="w-12 h-12 text-success-500" />
                <p className="text-sm font-medium text-foreground">
                  Account claimed successfully!
                </p>
                <button
                  onClick={() => setQrModal(null)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {qrModal.phase === "failure" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <XCircle className="w-12 h-12 text-danger-500" />
                <p className="text-sm font-medium text-foreground">
                  QR code expired or failed.
                </p>
                <button
                  onClick={() => {
                    setQrModal(null);
                    generateQr(qrModal.user, false);
                  }}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Registered table ─────────────────────────────────────────────────────────

function RegisteredTable({
  users,
  sortBy,
  SortIndicator,
  handleSort,
  router,
}: {
  users: User[];
  sortBy: string;
  SortIndicator: ({ col }: { col: string }) => React.ReactNode;
  handleSort: (col: "registeredAt" | "name" | "email") => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => handleSort("name")}
          >
            User
            <SortIndicator col="name" />
          </th>
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => handleSort("email")}
          >
            Email
            <SortIndicator col="email" />
          </th>
          <th className="px-5 py-3">DID</th>
          <th className="px-5 py-3">Role</th>
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => handleSort("registeredAt")}
          >
            Registered
            <SortIndicator col="registeredAt" />
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200">
        {users.map((u) => (
          <tr
            key={u.id}
            className="hover:bg-background-200/40 transition-colors cursor-pointer"
            onClick={() =>
              u.did && router.push(`/users/${encodeURIComponent(u.did)}`)
            }
          >
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary-600">
                    {initials(u)}
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
            <td className="px-5 py-3.5 text-foreground-500">
              {u.email ?? <span className="text-foreground-400">—</span>}
            </td>
            <td className="px-5 py-3.5 text-foreground-500 font-mono text-xs">
              <span title={u.did ?? ""}>{shortDid(u.did)}</span>
            </td>
            <td className="px-5 py-3.5">
              {u.isOwner ? (
                <span className="px-2 py-0.5 bg-warning-100 text-warning-700 border border-warning-300 rounded-full text-xs font-medium">
                  Owner
                </span>
              ) : u.isAdmin ? (
                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 border border-primary-300 rounded-full text-xs font-medium">
                  Admin
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-background-200 text-foreground-500 border border-neutral-200 rounded-full text-xs font-medium capitalize">
                  {u.role || "Member"}
                </span>
              )}
            </td>
            <td className="px-5 py-3.5 text-foreground-500 text-xs">
              {new Date(
                u.registeredAt + (u.registeredAt.endsWith("Z") ? "" : "Z")
              ).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Unclaimed table ──────────────────────────────────────────────────────────

function UnclaimedTable({
  users,
  sortBy,
  SortIndicator,
  handleSort,
  router,
  smtpAvailable,
  sendingQr,
  generateQr,
}: {
  users: User[];
  sortBy: string;
  SortIndicator: ({ col }: { col: string }) => React.ReactNode;
  handleSort: (col: "registeredAt" | "name" | "email") => void;
  router: ReturnType<typeof useRouter>;
  smtpAvailable: boolean;
  sendingQr: string | null;
  generateQr: (user: User, sendByEmail: boolean) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => handleSort("name")}
          >
            User
            <SortIndicator col="name" />
          </th>
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => handleSort("email")}
          >
            Email
            <SortIndicator col="email" />
          </th>
          <th className="px-5 py-3">Source</th>
          <th className="px-5 py-3">Role</th>
          <th
            className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
            onClick={() => handleSort("registeredAt")}
          >
            Provisioned
            <SortIndicator col="registeredAt" />
          </th>
          <th className="px-5 py-3">Claim</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200">
        {users.map((u) => (
          <tr
            key={u.id}
            className="hover:bg-background-200/40 transition-colors cursor-pointer"
            onClick={() => router.push(`/users/unregistered/${u.id}`)}
          >
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-warning-100 border border-warning-300 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-warning-600">
                    {initials(u)}
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
              {new Date(
                u.registeredAt + (u.registeredAt.endsWith("Z") ? "" : "Z")
              ).toLocaleDateString()}
            </td>
            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => generateQr(u, false)}
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
                    onClick={() => generateQr(u, true)}
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
