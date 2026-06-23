"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import InviteUserModal from "@/components/users/InviteUserModal";
import { Users, Plus, UserCheck, Clock, Filter } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  usersClient,
  serverClient,
  userAuthClient,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { UserListItem, ListUsersQuery } from "@/lib/contracts";
import { RegisteredUsersTable } from "@/components/users/RegisteredUsersTable";
import { UnclaimedUsersTable } from "@/components/users/UnclaimedUsersTable";
import { UsersPagination } from "@/components/users/UsersPagination";
import { QrClaimModal, type QrPhase } from "@/components/users/QrClaimModal";
import type { SortCol } from "@/components/users/RegisteredUsersTable";

type QrModalState = {
  user: UserListItem;
  qrUrl: string;
  token: string;
  phase: QrPhase;
};

type Tab = "registered" | "unregistered";

const PAGE_SIZE = 20;
const ROLES = ["owner", "admin", "manager", "operator", "member"] as const;
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "registeredAt:asc", label: "Provisioned (oldest)" },
  { value: "registeredAt:desc", label: "Provisioned (newest)" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "email:asc", label: "Email A–Z" },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function UsersPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("registered");
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // QR flow
  const [smtpAvailable, setSmtpAvailable] = useState(false);
  const [sendingQr, setSendingQr] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<QrModalState | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortCol>("registeredAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    serverClient
      .getSmtp()
      .then((res) =>
        setSmtpAvailable(
          res.status === 200 && Boolean((res.body as { host?: string })?.host)
        )
      )
      .catch(() => {});
  }, []);

  const loadUsers = useCallback(
    async (params: {
      tab: Tab;
      q: string;
      role: string;
      page: number;
      sortBy: SortCol;
      sortDir: "asc" | "desc";
    }) => {
      setLoading(true);
      try {
        const data = unwrap(
          await usersClient.list({
            query: {
              page: params.page,
              pageSize: PAGE_SIZE,
              sortBy: params.sortBy,
              sortDir: params.sortDir,
              hasAccount: params.tab === "registered" ? "true" : "false",
              q: params.q || undefined,
              role: (params.role || undefined) as ListUsersQuery["role"],
            },
          })
        );
        setUsers(data.users);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          window.location.href = "/";
          return;
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => loadUsers({ tab, q, role, page, sortBy, sortDir }),
      q ? 300 : 0
    );
  }, [tab, q, role, page, sortBy, sortDir, loadUsers]);

  const reload = () => loadUsers({ tab, q, role, page, sortBy, sortDir });

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setQ("");
    setRole("");
  };

  const handleSort = (col: SortCol) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const generateQr = async (user: UserListItem, sendByEmail: boolean) => {
    setSendingQr(user.id);
    try {
      if (sendByEmail) {
        try {
          unwrap(
            await usersClient.inviteEmail({
              body: {
                email: user.email ?? "",
                name: user.name ?? "",
                role: user.role,
              },
            })
          );
          alert(`Invitation sent to ${user.email}`);
          reload();
        } catch (err) {
          alert(
            err instanceof ApiError ? err.message : "Failed to send invitation"
          );
        }
        return;
      }

      const [inviteRes, settingsRes] = await Promise.all([
        usersClient.invite(),
        serverClient.getSettings(),
      ]);
      const data = unwrap(inviteRes);
      const settings = unwrap(settingsRes);
      const base = settings.walletUrl || "https://wallet.vaultys.net";
      const didParam = data.serverDid
        ? `&did=${encodeURIComponent(data.serverDid)}`
        : "";
      const qrUrl = `${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`;

      setQrModal({ user, qrUrl, token: data.token, phase: "showing" });

      // Poll until the wallet completes (or it expires).
      for (let i = 0; i < 180; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const { status } = unwrap(
          await userAuthClient.listen({ params: { token: data.token } })
        );
        if (status === 2) {
          setQrModal((m) => (m ? { ...m, phase: "success" } : null));
          reload();
          return;
        }
        if (status === -2) {
          setQrModal((m) => (m ? { ...m, phase: "failure" } : null));
          return;
        }
      }
    } finally {
      setSendingQr(null);
    }
  };

  const currentSort = `${sortBy}:${sortDir}`;

  useBreadcrumbs([{ label: "Users" }], []);

  useToolbar(
    {
      title: "Users",
      description: loading
        ? "Loading…"
        : `${total} ${tab === "registered" ? "registered" : "unclaimed"}`,
      actions: [
        {
          kind: "tabs" as const,
          id: "tab",
          value: tab,
          onChange: (v) => switchTab(v as Tab),
          options: [
            {
              value: "registered",
              label: "Registered",
              icon: <UserCheck className="w-3.5 h-3.5" />,
            },
            {
              value: "unregistered",
              label: "Unclaimed",
              icon: <Clock className="w-3.5 h-3.5" />,
            },
          ],
        },
        {
          kind: "button" as const,
          id: "invite",
          label: "Invite User",
          variant: "primary" as const,
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: () => setShowInvite(true),
        },
      ],
      search: {
        value: q,
        onChange: (v) => {
          setQ(v);
          setPage(1);
        },
        placeholder:
          tab === "registered"
            ? "Search name, email or DID…"
            : "Search name or email…",
        chips: role
          ? [
              {
                id: "role",
                label: `Role: ${cap(role)}`,
                onRemove: () => {
                  setRole("");
                  setPage(1);
                },
              },
            ]
          : [],
        filterGroups: [
          ...(tab === "registered"
            ? [
                {
                  id: "role",
                  label: "Role",
                  icon: <Filter className="w-3.5 h-3.5 text-primary-600" />,
                  options: ROLES.map((r) => ({
                    id: `role-${r}`,
                    label: cap(r),
                    active: role === r,
                    onToggle: () => {
                      setRole(role === r ? "" : r);
                      setPage(1);
                    },
                  })),
                  onClear: role
                    ? () => {
                        setRole("");
                        setPage(1);
                      }
                    : undefined,
                },
              ]
            : []),
          {
            id: "sort",
            label: "Sort by",
            options: SORT_OPTIONS.map((o) => ({
              id: `sort-${o.value}`,
              label: o.label,
              active: currentSort === o.value,
              onToggle: () => {
                const [col, dir] = o.value.split(":") as [SortCol, "asc" | "desc"];
                setSortBy(col);
                setSortDir(dir);
                setPage(1);
              },
            })),
          },
        ],
      },
    },
    [loading, total, tab, q, role, sortBy, sortDir]
  );

  const emptyMessage =
    q || role
      ? "No users match your filters"
      : tab === "registered"
        ? "No registered users yet."
        : "No unclaimed users.";

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
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
                <RegisteredUsersTable
                  users={users}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  onRowClick={(u) =>
                    u.did &&
                    router.push(`/users/${encodeURIComponent(u.did)}`)
                  }
                />
              ) : (
                <UnclaimedUsersTable
                  users={users}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  onRowClick={(u) =>
                    router.push(`/users/unregistered/${u.id}`)
                  }
                  smtpAvailable={smtpAvailable}
                  sendingQr={sendingQr}
                  onGenerateQr={generateQr}
                />
              )}
            </div>

            <UsersPagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false);
            reload();
          }}
        />
      )}

      {qrModal && (
        <QrClaimModal
          subtitle={qrModal.user.name ?? qrModal.user.email ?? "Unknown user"}
          qrUrl={qrModal.qrUrl}
          phase={qrModal.phase}
          onClose={() => setQrModal(null)}
          onRetry={() => {
            setQrModal(null);
            generateQr(qrModal.user, false);
          }}
        />
      )}
    </div>
  );
}
