"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  AlertCircle,
  Save,
  Trash2,
  QrCode,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  X,
  LayoutDashboard,
  Users,
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

interface UnclaimedUser {
  id: string;
  did: null;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  role: string;
  reportsTo: string | null;
  description: string | null;
  registeredAt: string;
  entraId: string | null;
  claimedAt: null;
  realms: UserRealm[];
}

type TabId = "overview" | "realms";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(user: UnclaimedUser): string {
  if (user.name) return user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  if (user.email) return user.email.slice(0, 2).toUpperCase();
  return "??";
}

function formatDate(iso: string): string {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleString();
}

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "operator", label: "Operator" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
] as const;

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
    { id: "realms", label: "Realms", icon: <Users size={15} /> },
  ];
  return (
    <div className="flex gap-1 border-b border-neutral-200 px-1 bg-background-100 rounded-t-xl overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? "border-indigo-500 text-indigo-500 dark:text-indigo-400"
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

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QrModal({
  user,
  qrUrl,
  phase,
  onClose,
  onRetry,
}: {
  user: UnclaimedUser;
  qrUrl: string;
  phase: "showing" | "success" | "failure";
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Claim Account</h3>
            <p className="text-xs text-foreground-500 mt-0.5">
              {user.name ?? user.email ?? "Unknown user"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === "showing" && (
          <>
            <p className="text-xs text-foreground-500 text-center">
              Scan this QR code with the Vaultys wallet to activate the account.
            </p>
            <div className="flex justify-center p-4 bg-white rounded-xl">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <div className="flex items-center gap-2 text-xs text-foreground-400">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              Waiting for wallet scan…
            </div>
          </>
        )}

        {phase === "success" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-sm font-medium text-foreground">Account claimed successfully!</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {phase === "failure" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <XCircle className="w-12 h-12 text-red-500" />
            <p className="text-sm font-medium text-foreground">QR code expired or failed.</p>
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UnregisteredUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: session } = useSession();

  const [user, setUser] = useState<UnclaimedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [smtpAvailable, setSmtpAvailable] = useState(false);
  const [sendingQr, setSendingQr] = useState(false);
  const [qrModal, setQrModal] = useState<{
    qrUrl: string;
    token: string;
    phase: "showing" | "success" | "failure";
  } | null>(null);

  const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);

  const load = useCallback(async () => {
    const res = await fetch(`/api/users/unclaimed/${id}`);
    if (res.status === 403) { router.push("/"); return; }
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    setUser(await res.json() as UnclaimedUser);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/server/smtp")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { host?: string } | null) => setSmtpAvailable(Boolean(d?.host)))
      .catch(() => {});
  }, []);

  const generateQr = async (sendByEmail: boolean) => {
    if (!user) return;
    setSendingQr(true);
    try {
      if (sendByEmail) {
        // Send email invitation
        const r = await fetch("/api/users/invite/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, name: user.name, role: user.role }),
        });
        const d = await r.json() as { token?: string; userId?: string; error?: string };
        if (!r.ok) {
          alert(d.error ?? "Failed to send invitation");
          return;
        }
        alert(`Invitation sent to ${user.email}`);
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
        const { walletUrl } = (await settingsRes.json()) as { walletUrl?: string };
        const base = walletUrl ?? "https://wallet.vaultys.net";
        const didParam = data.serverDid ? `&did=${encodeURIComponent(data.serverDid)}` : "";
        const qrUrl = `${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`;

        setQrModal({ qrUrl, token: data.token, phase: "showing" });

        // Poll until done
        for (let i = 0; i < 180; i++) {
          await new Promise((res) => setTimeout(res, 1500));
          const pr = await fetch(`/api/user/listen/${data.token}`);
          const { status } = await pr.json() as { status: number };
          if (status === 2) {
            setQrModal((m) => m ? { ...m, phase: "success" } : null);
            setTimeout(() => {
              load().then(() => {
                fetch(`/api/users/unclaimed/${id}`)
                  .then((res) => {
                    if (res.status === 404) router.push("/users");
                  })
                  .catch(() => {});
              });
            }, 1500);
            return;
          }
          if (status === -2) {
            setQrModal((m) => m ? { ...m, phase: "failure" } : null);
            return;
          }
        }
      }
    } finally {
      setSendingQr(false);
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
      <div className="p-6 max-w-7xl mx-auto">
        <button onClick={() => router.push("/users")} className="flex items-center gap-1.5 text-foreground-500 hover:text-foreground text-sm mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Users
        </button>
        <div className="flex flex-col items-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-foreground font-medium">User not found or already claimed</p>
          <p className="text-foreground-500 text-sm mt-1">They may have claimed their account or been removed.</p>
          <button onClick={() => router.push("/users")} className="mt-4 text-indigo-500 text-sm hover:underline">
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

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
        <div className="bg-background-100 border border-neutral-200 rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap">
          <div className="flex-shrink-0 w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/50 flex items-center justify-center">
            <span className="text-base font-bold text-amber-600 dark:text-amber-400">{initials(user)}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">
                {user.name ?? <span className="italic font-normal text-foreground-400">Unnamed user</span>}
              </h1>
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700/50 rounded-full text-xs font-medium">
                Unclaimed
              </span>
              {user.entraId && (
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 rounded-full text-xs font-medium">
                  Entra ID
                </span>
              )}
            </div>
            {user.email && (
              <p className="text-xs text-foreground-500 mt-0.5">{user.email}</p>
            )}
            <p className="text-xs text-foreground-400 mt-0.5">
              Provisioned {formatDate(user.registeredAt)} · No VaultysID yet
            </p>
          </div>

          {/* Claim actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => generateQr(false)}
              disabled={sendingQr}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              {sendingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Show QR
            </button>
            {user.email && smtpAvailable && (
              <button
                onClick={() => generateQr(true)}
                disabled={sendingQr}
                className="flex items-center gap-2 bg-background-200 hover:bg-neutral-300/20 border border-neutral-300 disabled:opacity-50 text-foreground text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
                Send by email
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-background-100">
        <TabBar active={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === "overview" && (
            <OverviewTab
              user={user}
              isAdmin={isAdmin}
              onUpdated={(patch) => setUser((u) => u ? { ...u, ...patch } : u)}
            />
          )}
          {activeTab === "realms" && (
            <RealmsTab realms={user.realms} />
          )}
        </div>
      </div>

      {/* Danger zone */}
      {isAdmin && (
        <DangerZone id={user.id} userName={user.name ?? user.email} />
      )}

      {/* QR Modal */}
      {qrModal && user && (
        <QrModal
          user={user}
          qrUrl={qrModal.qrUrl}
          phase={qrModal.phase}
          onClose={() => setQrModal(null)}
          onRetry={() => { setQrModal(null); generateQr(false); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  user,
  isAdmin,
  onUpdated,
}: {
  user: UnclaimedUser;
  isAdmin: boolean;
  onUpdated: (patch: Partial<UnclaimedUser>) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [description, setDescription] = useState(user.description ?? "");
  const [role, setRole] = useState(user.role ?? "member");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mark = () => { setDirty(true); setSaveError(null); };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/users/unclaimed/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, description, role }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setSaveError(d.error ?? "Failed to save");
    } else {
      setDirty(false);
      onUpdated({ name: name || null, email: email || null, description: description || null, role });
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">Profile</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">Display name</label>
            <input
              type="text"
              placeholder="e.g. Alice Martin"
              value={name}
              onChange={(e) => { setName(e.target.value); mark(); }}
              disabled={!isAdmin}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">Email address</label>
            <input
              type="email"
              placeholder="e.g. alice@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); mark(); }}
              disabled={!isAdmin}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">Description</label>
            <textarea
              rows={3}
              placeholder="Short description of this user's responsibilities…"
              value={description}
              onChange={(e) => { setDescription(e.target.value); mark(); }}
              disabled={!isAdmin}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">Role</label>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); mark(); }}
              disabled={!isAdmin}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {user.entraId && (
        <section>
          <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">Entra Identity</h2>
          <div className="bg-background-200 rounded-lg border border-neutral-200 divide-y divide-neutral-200">
            <div className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">Object ID</div>
              <div className="flex-1 text-xs font-mono text-foreground break-all">{user.entraId}</div>
            </div>
            <div className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">Status</div>
              <div className="flex-1 text-sm text-amber-600 dark:text-amber-400">
                Waiting for account claim via QR code
              </div>
            </div>
            <div className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">Provisioned</div>
              <div className="flex-1 text-sm text-foreground">{formatDate(user.registeredAt)}</div>
            </div>
          </div>
        </section>
      )}

      {saveError && (
        <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      {isAdmin && (
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
      )}
    </div>
  );
}

// ─── Tab: Realms ──────────────────────────────────────────────────────────────

function RealmsTab({ realms }: { realms: UserRealm[] }) {
  if (realms.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center text-foreground-500 gap-2">
        <Users size={36} strokeWidth={1} />
        <p className="text-sm">This user has not been assigned to any realms.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider">Realm memberships</h2>
      <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
        {realms.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3 bg-background-200">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: r.color }}
            />
            <span className="flex-1 text-sm text-foreground">{r.name}</span>
            <span className="text-xs text-foreground-400 font-mono">{r.slug}</span>
            {r.isPrimary && (
              <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded text-xs">
                Primary
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Danger zone ──────────────────────────────────────────────────────────────

function DangerZone({ id, userName }: { id: string; userName: string | null }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!confirm(`Remove ${userName ?? "this user"}? This cannot be undone.`)) return;
    setRemoving(true);
    await fetch(`/api/users/unclaimed/${id}`, { method: "DELETE" });
    router.push("/users");
  };

  return (
    <div className="mt-6 bg-background-100 border border-red-200 dark:border-red-900/50 rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Danger zone</h2>
      <p className="text-foreground-500 text-sm mb-4">
        Removing this provisioned user will delete their record. They will need to be re-synced from Entra to be re-invited.
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
