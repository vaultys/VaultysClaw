"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import UserGrantsPanel from "@/components/users/UserGrantsPanel";
import {
  ArrowLeft,
  Save,
  Trash2,
  AlertCircle,
  Shield,
  ShieldOff,
  User,
  LayoutDashboard,
  KeyRound,
  GitBranch,
  ChevronLeft,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { GraphNode } from "@vaultysclaw/shared";

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), {
  ssr: false,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserDetail {
  did: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  role: string;
  reportsTo: string | null;
  description: string | null;
  registeredAt: string;
}

interface UserSummary {
  did: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
}

type TabId = "overview" | "access" | "grants" | "details";

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "operator", label: "Operator" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortDid(did: string): string {
  if (did.length <= 32) return did;
  return `${did.slice(0, 20)}…${did.slice(-10)}`;
}

function initials(user: UserDetail): string {
  if (user.name) {
    return user.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return user.did.slice(-2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleString();
}

// ---------------------------------------------------------------------------
// Tab bar (same pattern as agent page)
// ---------------------------------------------------------------------------

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 px-1 bg-background-100 rounded-t-xl overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? "border-primary-500 text-primary-400"
              : "border-transparent text-foreground-500 hover:text-foreground hover:border-neutral-300"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function UserEditPage() {
  const router = useRouter();
  const params = useParams<{ did: string }>();
  const did = decodeURIComponent(params.did);
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isOwner =
    (session?.user as { isOwner?: boolean } | undefined)?.isOwner ?? false;

  const load = useCallback(async () => {
    const res = await fetch(`/api/users/${encodeURIComponent(did)}`);
    if (res.status === 403) {
      router.push("/");
      return;
    }
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setUser((await res.json()) as UserDetail);
    setLoading(false);
  }, [did, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <button
          onClick={() => router.push("/users")}
          className="flex items-center gap-1.5 text-foreground-500 hover:text-foreground text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Users
        </button>
        <div className="flex flex-col items-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-foreground font-medium">User not found</p>
          <p className="text-foreground-500 text-sm mt-1">
            This user may have been removed.
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const tabs: Tab[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
    { id: "access", label: "Access", icon: <Shield size={15} /> },
    { id: "grants", label: "Grants", icon: <KeyRound size={15} /> },
    { id: "details", label: "Details", icon: <GitBranch size={15} /> },
  ];

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-0">
      {/* Back nav */}
      <div className="mb-4">
        <button
          onClick={() => router.push("/users")}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft size={15} />
          Back to Users
        </button>

        {/* Header card */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-600/20 border border-primary-500/30 flex items-center justify-center">
            <span className="text-base font-bold text-primary-400">
              {initials(user)}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">
                {user.name ?? (
                  <span className="italic font-normal text-foreground-400">
                    Unnamed user
                  </span>
                )}
              </h1>
              {user.isOwner && (
                <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800 rounded-full text-xs font-medium">
                  Owner
                </span>
              )}
              {user.isAdmin && !user.isOwner && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800 rounded-full text-xs font-medium">
                  Admin
                </span>
              )}
              {!user.isOwner && !user.isAdmin && (
                <span className="px-2 py-0.5 bg-background-200 border border-neutral-300 text-foreground-500 rounded-full text-xs font-medium capitalize">
                  {user.role}
                </span>
              )}
            </div>
            <p
              className="text-xs font-mono text-foreground-500 mt-0.5 truncate"
              title={user.did}
            >
              {shortDid(user.did)}
            </p>
            {user.description && (
              <p className="text-xs text-foreground-500 mt-0.5 truncate">
                {user.description}
              </p>
            )}
          </div>

          <div className="hidden sm:flex gap-6 text-right flex-shrink-0">
            <div>
              <div className="text-xs text-foreground-500 uppercase">
                Registered
              </div>
              <div className="text-sm text-foreground">
                {formatDate(user.registeredAt)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-background-100">
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === "overview" && (
            <OverviewTab
              user={user}
              isOwner={isOwner}
              onUpdated={(patch) =>
                setUser((u) => (u ? { ...u, ...patch } : u))
              }
            />
          )}
          {activeTab === "access" && (
            <AccessTab
              user={user}
              isOwner={isOwner}
              onUpdated={(patch) =>
                setUser((u) => (u ? { ...u, ...patch } : u))
              }
            />
          )}
          {activeTab === "grants" && !user.isOwner && (
            <div>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Agent Grants
                </h2>
                <p className="text-xs text-foreground-500 mt-0.5">
                  Capabilities this user can delegate to agents.
                </p>
              </div>
              <UserGrantsPanel userDid={user.did} />
            </div>
          )}
          {activeTab === "grants" && user.isOwner && (
            <div className="flex flex-col items-center py-12 text-foreground-500 gap-2">
              <KeyRound size={36} strokeWidth={1} />
              <p className="text-sm">
                The owner has access to all capabilities.
              </p>
            </div>
          )}
          {activeTab === "details" && (
            <DetailsTab
              user={user}
              onNodeClick={(node: GraphNode) => {
                if (node.type === "agent")
                  router.push(
                    `/agents/${encodeURIComponent(node.id.replace("agent:", ""))}`
                  );
                else if (node.type === "realm")
                  router.push(`/realms/${node.id.replace("realm:", "")}`);
                else if (node.type === "user") {
                  const uid = node.id.replace("user:", "");
                  if (uid !== user.did)
                    router.push(`/users/${encodeURIComponent(uid)}`);
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Danger zone — outside tabs, visible only to owner for non-owner users */}
      {!user.isOwner && isOwner && (
        <DangerZone did={did} userName={user.name} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview (Profile + Role + Supervisor)
// ---------------------------------------------------------------------------

function OverviewTab({
  user,
  isOwner,
  onUpdated,
}: {
  user: UserDetail;
  isOwner: boolean;
  onUpdated: (patch: Partial<UserDetail>) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [description, setDescription] = useState(user.description ?? "");
  const [role, setRole] = useState(user.role ?? "member");
  const [reportsTo, setReportsTo] = useState<string>(user.reportsTo ?? "");

  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mark = () => {
    setDirty(true);
    setSaveError(null);
  };

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d: { users: UserSummary[] }) => setAllUsers(d.users))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/users/${encodeURIComponent(user.did)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        description,
        role,
        reportsTo: reportsTo || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveError(d.error ?? "Failed to save");
    } else {
      setDirty(false);
      onUpdated({
        name: name || null,
        email: email || null,
        description: description || null,
        role,
        reportsTo: reportsTo || null,
      });
    }
  };

  const supervisorOptions = allUsers.filter((u) => u.did !== user.did);
  const currentSupervisor = supervisorOptions.find((u) => u.did === reportsTo);

  return (
    <div className="space-y-6">
      {/* Profile */}
      <section>
        <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
          Profile
        </h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Display name
            </label>
            <input
              type="text"
              placeholder="e.g. Alice Martin"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                mark();
              }}
              disabled={!isOwner}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Email address
            </label>
            <input
              type="email"
              placeholder="e.g. alice@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                mark();
              }}
              disabled={!isOwner}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Short description of this user's responsibilities…"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                mark();
              }}
              disabled={!isOwner}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Decentralized Identity (DID)
            </label>
            <div className="w-full bg-background-200 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-mono text-foreground-500 break-all select-all">
              {user.did}
            </div>
          </div>
        </div>
      </section>

      {/* Role & Hierarchy */}
      <section>
        <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
          Role & Hierarchy
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Role
            </label>
            {user.isOwner ? (
              <div className="w-full bg-background-200 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-foreground-500">
                Owner (cannot be changed)
              </div>
            ) : (
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  mark();
                }}
                disabled={!isOwner}
                className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Supervisor
            </label>
            {!isOwner ? (
              <div className="w-full bg-background-200 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-foreground-500">
                {currentSupervisor ? (
                  (currentSupervisor.name ?? shortDid(currentSupervisor.did))
                ) : (
                  <span className="italic">None</span>
                )}
              </div>
            ) : (
              <select
                value={reportsTo}
                onChange={(e) => {
                  setReportsTo(e.target.value);
                  mark();
                }}
                className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              >
                <option value="">— No supervisor —</option>
                {supervisorOptions.map((u) => (
                  <option key={u.did} value={u.did}>
                    {u.name ?? shortDid(u.did)}
                    {u.isOwner ? " (Owner)" : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-foreground-400 mt-1">
              Defines the reporting line shown in the relationship graph.
            </p>
          </div>
        </div>
      </section>

      {saveError && (
        <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      {isOwner && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Access (admin toggle)
// ---------------------------------------------------------------------------

function AccessTab({
  user,
  isOwner,
  onUpdated,
}: {
  user: UserDetail;
  isOwner: boolean;
  onUpdated: (patch: Partial<UserDetail>) => void;
}) {
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleAdminToggle = async (makeAdmin: boolean) => {
    setAdminLoading(true);
    setAdminError(null);
    const res = await fetch(
      `/api/users/${encodeURIComponent(user.did)}/admin`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: makeAdmin }),
      }
    );
    setAdminLoading(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setAdminError(d.error ?? "Failed to update admin status");
    } else {
      onUpdated({ isAdmin: makeAdmin });
    }
  };

  if (user.isOwner) {
    return (
      <div className="flex flex-col items-center py-12 text-foreground-500 gap-2">
        <Shield size={36} strokeWidth={1} />
        <p className="text-sm">
          The owner has full control-plane access by default.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">
          Control-plane access
        </h2>
        <p className="text-xs text-foreground-500">
          Admins can log into the control plane and manage agents, users, and
          grants.
        </p>
      </div>

      {adminError && (
        <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {adminError}
        </div>
      )}

      <div className="bg-background-200 rounded-lg border border-neutral-200 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Admin role</p>
          <p className="text-xs text-foreground-500 mt-0.5">
            {user.isAdmin
              ? "This user can access the control plane."
              : "This user has no control-plane access."}
          </p>
        </div>
        {isOwner &&
          (user.isAdmin ? (
            <button
              onClick={() => handleAdminToggle(false)}
              disabled={adminLoading}
              className="flex items-center gap-2 bg-background-200 border border-neutral-300 hover:border-red-400 text-foreground hover:text-red-500 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <ShieldOff className="w-4 h-4" />
              {adminLoading ? "Updating…" : "Revoke admin"}
            </button>
          ) : (
            <button
              onClick={() => handleAdminToggle(true)}
              disabled={adminLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <Shield className="w-4 h-4" />
              {adminLoading ? "Updating…" : "Make admin"}
            </button>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Details (Graph + metadata)
// ---------------------------------------------------------------------------

function DetailsTab({
  user,
  onNodeClick,
}: {
  user: UserDetail;
  onNodeClick: (node: GraphNode) => void;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Relationships
        </h2>
        <div className="rounded-lg overflow-hidden border border-neutral-200">
          <RealmGraph
            query={`?user=${encodeURIComponent(user.did)}`}
            height={380}
            onNodeClick={onNodeClick}
            currentUserId={user.did}
            defaultView="org-chart"
          />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Identity
        </h2>
        <div className="bg-background-200 rounded-lg border border-neutral-200 divide-y divide-neutral-200">
          {[
            {
              label: "DID",
              value: (
                <span className="font-mono text-xs break-all text-foreground-700">
                  {user.did}
                </span>
              ),
            },
            {
              label: "Registered",
              value: (
                <span className="text-foreground">
                  {formatDate(user.registeredAt)}
                </span>
              ),
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                {label}
              </div>
              <div className="flex-1 text-sm">{value}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

function DangerZone({
  did,
  userName,
}: {
  did: string;
  userName: string | null;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (
      !confirm(
        `Remove ${userName ?? shortDid(did)} and all their grants? This cannot be undone.`
      )
    )
      return;
    setRemoving(true);
    await fetch(`/api/users/${encodeURIComponent(did)}`, { method: "DELETE" });
    router.push("/users");
  };

  return (
    <div className="mt-6 bg-background-100 border border-red-200 dark:border-red-900/50 rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
        Danger zone
      </h2>
      <p className="text-foreground-500 text-sm mb-4">
        Removing a user revokes all their grants permanently.
      </p>
      <button
        onClick={handleRemove}
        disabled={removing}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        {removing ? "Removing…" : "Remove user"}
      </button>
    </div>
  );
}
