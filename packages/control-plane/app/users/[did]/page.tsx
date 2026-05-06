"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import UserGrantsPanel from "@/components/users/UserGrantsPanel";
import { ArrowLeft, Save, Trash2, AlertCircle, Shield, ShieldOff } from "lucide-react";
import dynamic from "next/dynamic";
import type { GraphNode } from "@vaultysclaw/shared";

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), { ssr: false });

interface UserDetail {
  did: string;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  registeredAt: string;
}

function shortDid(did: string): string {
  if (did.length <= 32) return did;
  return `${did.slice(0, 20)}…${did.slice(-10)}`;
}

function initials(user: UserDetail): string {
  if (user.name) {
    return user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }
  return user.did.slice(-2).toUpperCase();
}

export default function UserEditPage() {
  const router = useRouter();
  const params = useParams<{ did: string }>();
  const did = decodeURIComponent(params.did);
  const { data: session } = useSession();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/users/${encodeURIComponent(did)}`);
    if (res.status === 403) { router.push("/"); return; }
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    const data = await res.json() as UserDetail;
    setUser(data);
    setName(data.name ?? "");
    setEmail(data.email ?? "");
    setLoading(false);
  }, [did, router]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/users/${encodeURIComponent(did)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setSaveError(d.error ?? "Failed to save");
    } else {
      setDirty(false);
      setUser((u) => u ? { ...u, name: name || null, email: email || null } : u);
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    if (!confirm(`Remove ${user.name ?? shortDid(user.did)} and all their grants? This cannot be undone.`)) return;
    setRemoving(true);
    await fetch(`/api/users/${encodeURIComponent(did)}`, { method: "DELETE" });
    router.push("/users");
  };

  const handleAdminToggle = async (makeAdmin: boolean) => {
    if (!user) return;
    setAdminLoading(true);
    setAdminError(null);
    const res = await fetch(`/api/users/${encodeURIComponent(did)}/admin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: makeAdmin }),
    });
    setAdminLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setAdminError(d.error ?? "Failed to update admin status");
    } else {
      setUser((u) => u ? { ...u, isAdmin: makeAdmin } : u);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={() => router.push("/users")} className="flex items-center gap-1.5 text-vc-muted hover:text-vc-text text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Users
        </button>
        <div className="flex flex-col items-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-vc-ring mb-3" />
          <p className="text-vc-text font-medium">User not found</p>
          <p className="text-vc-muted text-sm mt-1">This user may have been removed.</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Back nav */}
      <button
        onClick={() => router.push("/users")}
        className="flex items-center gap-1.5 text-vc-muted hover:text-vc-text text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700/50 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{initials(user)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-vc-text">
              {user.name ?? <span className="italic text-vc-subtle font-normal">Unnamed user</span>}
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
          </div>
          <p className="text-vc-subtle text-xs font-mono mt-0.5 break-all" title={user.did}>{shortDid(user.did)}</p>
          <p className="text-vc-subtle text-xs mt-0.5">
            Registered {new Date(user.registeredAt + (user.registeredAt.endsWith("Z") ? "" : "Z")).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Profile fields */}
      <div className="bg-vc-surface border border-vc-border rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-vc-text mb-1">Profile</h2>

        <div className="space-y-1">
          <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Display name</label>
          <input
            type="text"
            placeholder="e.g. Alice Martin"
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); setSaveError(null); }}
            className="w-full bg-vc-raised border border-vc-ring text-vc-text text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-vc-subtle transition-colors"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Email address</label>
          <input
            type="email"
            placeholder="e.g. alice@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDirty(true); setSaveError(null); }}
            className="w-full bg-vc-raised border border-vc-ring text-vc-text text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-vc-subtle transition-colors"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Decentralized Identity (DID)</label>
          <div className="w-full bg-vc-raised border border-vc-border rounded-xl px-4 py-2.5 text-sm font-mono text-vc-muted break-all select-all">
            {user.did}
          </div>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Admin access — visible to the owner only, for non-owner users */}
      {!user.isOwner && (session?.user as { isOwner?: boolean } | undefined)?.isOwner && (
        <div className="bg-vc-surface border border-vc-border rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-vc-text mb-1">Control-plane access</h2>
          <p className="text-vc-muted text-sm mb-4">
            Admins can log into the control plane and manage agents, users, and grants.
          </p>

          {adminError && (
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-2.5 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {adminError}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-vc-text">Admin role</p>
              <p className="text-xs text-vc-muted mt-0.5">
                {user.isAdmin ? "This user can access the control plane." : "This user has no control-plane access."}
              </p>
            </div>
            {user.isAdmin ? (
              <button
                onClick={() => handleAdminToggle(false)}
                disabled={adminLoading}
                className="flex items-center gap-2 bg-vc-raised border border-vc-ring hover:border-red-400 text-vc-text hover:text-red-500 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
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
            )}
          </div>
        </div>
      )}

      {/* Grants */}
      {!user.isOwner && (
        <div className="bg-vc-surface border border-vc-border rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-vc-text mb-4">Agent Grants</h2>
          <UserGrantsPanel userDid={user.did} />
        </div>
      )}

      {/* Relationships Graph */}
      <div className="bg-vc-surface rounded-2xl border border-vc-border p-6">
        <h2 className="text-sm font-semibold text-vc-text mb-4">Relationships</h2>
        <RealmGraph
          query={`?user=${encodeURIComponent(user.did)}`}
          height={400}
          onNodeClick={(node: GraphNode) => {
            if (node.type === "agent") router.push(`/agents/${encodeURIComponent(node.id.replace("agent:", ""))}`);
            else if (node.type === "realm") router.push(`/realms/${node.id.replace("realm:", "")}`);
            else if (node.type === "user") {
              const uid = node.id.replace("user:", "");
              if (uid !== user.did) router.push(`/users/${encodeURIComponent(uid)}`);
            }
          }}
        />
      </div>

      {/* Danger zone */}
      {!user.isOwner && (
        <div className="bg-vc-surface border border-red-200 dark:border-red-900/50 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Danger zone</h2>
          <p className="text-vc-muted text-sm mb-4">Removing a user revokes all their grants permanently.</p>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {removing ? "Removing…" : "Remove user"}
          </button>
        </div>
      )}
    </div>
  );
}
