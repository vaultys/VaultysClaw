"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import {
  Sun,
  Moon,
  Monitor,
  Check,
  Shield,
  Key,
  User,
  Globe2,
  Copy,
  Edit2,
  X,
  MapPin,
  Calendar,
  FileText,
  Fingerprint,
  Crown,
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  did: string | null;
  publicKey: string | null;
  name: string | null;
  email: string | null;
  description: string | null;
  role: string;
  isOwner: boolean;
  isAdmin: boolean;
  entraId: string | null;
  locationLabel: string | null;
  registeredAt: string;
  claimedAt: string | null;
}

interface RealmMembership {
  realmId: string;
  realmName: string;
  realmSlug: string;
  realmColor: string | null;
  isDefault: boolean;
  isPrimary: boolean;
  isRealmAdmin: boolean;
  joinedAt: string;
}

// ─── Theme options ────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; description: string; icon: React.ElementType }[] = [
  { value: "dark", label: "Dark", description: "Always use dark theme", icon: Moon },
  { value: "light", label: "Light", description: "Always use light theme", icon: Sun },
  { value: "system", label: "System", description: "Follow OS preference", icon: Monitor },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
      <Icon className="w-4 h-4 text-foreground-500" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-neutral-200/60 last:border-0">
      <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium shrink-0 pt-0.5">{label}</span>
      <span className={cn("text-sm text-right break-all", mono ? "font-mono text-xs text-foreground-700" : "text-foreground")}>{value}</span>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-1.5 text-foreground-400 hover:text-foreground transition shrink-0 align-middle inline-flex"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ─── Editable field ───────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  placeholder,
  textarea,
  maxLength,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  textarea?: boolean;
  maxLength?: number;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => { setDraft(value); }, [value]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="py-2.5 border-b border-neutral-200/60 last:border-0">
        <label className="text-xs text-foreground-400 uppercase tracking-wider font-medium block mb-1.5">{label}</label>
        <form onSubmit={submit} className="flex flex-col gap-2">
          {textarea ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={maxLength}
              placeholder={placeholder}
              className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none"
            />
          ) : (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={maxLength}
              placeholder={placeholder}
              autoFocus
              className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          )}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setDraft(value); }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
            {status === "error" && <span className="text-xs text-danger-600">Save failed</span>}
          </div>
          {maxLength && <p className="text-[10px] text-foreground-400 text-right">{draft.length}/{maxLength}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-neutral-200/60 last:border-0 group">
      <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium shrink-0 pt-0.5">{label}</span>
      <div className="flex items-start gap-2 min-w-0">
        <span className={cn("text-sm text-right break-all", !value && "text-foreground-400 italic")}>{value || placeholder || "—"}</span>
        <div className="flex items-center gap-1 shrink-0">
          {status === "saved" && <Check className="w-3.5 h-3.5 text-success-500" />}
          <button type="button" onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 text-foreground-400 hover:text-foreground transition">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [realms, setRealms] = useState<RealmMembership[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([
      fetch("/api/users/me").then((r) => r.json() as Promise<UserProfile>),
      fetch("/api/users/me/realms").then((r) => r.json() as Promise<{ memberships: RealmMembership[] }>),
    ]).then(([p, r]) => {
      setProfile(p);
      setRealms(r.memberships ?? []);
    }).catch(() => { }).finally(() => setProfileLoading(false));
  }, [session?.user]);

  const patchProfile = async (fields: Partial<Pick<UserProfile, "name" | "email" | "description">>) => {
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error("Save failed");
    const data = (await res.json()) as { name?: string | null; email?: string | null; description?: string | null };
    setProfile((p) => p ? { ...p, ...data } : p);
  };

  if (profileLoading) {
    return (
      <div className="p-6 w-full max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-background-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-5xl mx-auto space-y-6">

      {/* Profile */}
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={User} title="Profile" />
        <div className="p-5 space-y-0">
          <EditableField
            label="Display Name"
            value={profile?.name ?? ""}
            placeholder="Your name"
            maxLength={128}
            onSave={(v) => patchProfile({ name: v })}
          />
          <EditableField
            label="Email"
            value={profile?.email ?? ""}
            placeholder="your@email.com"
            maxLength={256}
            onSave={(v) => patchProfile({ email: v })}
          />
          <EditableField
            label="Bio"
            value={profile?.description ?? ""}
            placeholder="A short description about yourself"
            textarea
            maxLength={500}
            onSave={(v) => patchProfile({ description: v })}
          />
          {profile?.role && profile.role !== "member" && (
            <Row label="Org Role" value={<span className="capitalize">{profile.role}</span>} />
          )}
          {profile?.locationLabel && (
            <Row
              label="Location"
              value={
                <span className="flex items-center gap-1 justify-end">
                  <MapPin className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                  {profile.locationLabel}
                </span>
              }
            />
          )}
        </div>
      </section>

      {/* Identity */}
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={Shield} title="Identity & Security" />
        <div className="p-5 space-y-0">
          {profile?.did && (
            <Row
              label="DID"
              value={
                <span className="flex items-center gap-0.5">
                  <span className="font-mono text-xs inline-block">{profile.did}</span>
                  <CopyButton value={profile.did} />
                </span>
              }
            />
          )}
          {profile?.publicKey && (
            <Row
              label="Public Key"
              value={
                <span className="flex items-center gap-0.5">
                  <span className="font-mono text-xs inline-block text-foreground-500">
                    {profile.publicKey}
                  </span>
                  <CopyButton value={profile.publicKey} />
                </span>
              }
            />
          )}
          {profile?.entraId && (
            <Row label="Entra ID" value={<span className="font-mono text-xs text-foreground-500">{profile.entraId}</span>} />
          )}
          {profile?.registeredAt && (
            <Row
              label="Registered"
              value={
                <span className="flex items-center gap-1 justify-end">
                  <Calendar className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                  {formatDate(profile.registeredAt)}
                </span>
              }
            />
          )}
          {profile?.claimedAt && (
            <Row
              label="Account Claimed"
              value={
                <span className="flex items-center gap-1 justify-end">
                  <Fingerprint className="w-3.5 h-3.5 text-foreground-400 shrink-0" />
                  {formatDate(profile.claimedAt)}
                </span>
              }
            />
          )}
          <div className="pt-3 mt-1">
            <p className="text-xs text-foreground-400 leading-relaxed">
              Your identity is managed by your VaultysID wallet. To change it, re-authenticate with a different wallet.
            </p>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={BadgeCheck} title="Roles & Permissions" />
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {profile?.isOwner && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning-100 text-warning-700 border border-warning-300 rounded-full text-xs font-medium">
                <Crown className="w-3.5 h-3.5" /> Owner
              </span>
            )}
            {profile?.isAdmin && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-100 text-primary-700 border border-primary-300 rounded-full text-xs font-medium">
                <Shield className="w-3.5 h-3.5" /> Global Admin
              </span>
            )}
            {!profile?.isOwner && !profile?.isAdmin && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background-200 text-foreground-500 border border-neutral-300 rounded-full text-xs font-medium">
                <User className="w-3.5 h-3.5" /> Member
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-400">
            Roles are assigned by administrators. Contact your admin to request changes.
          </p>
        </div>
      </section>

      {/* Realm memberships */}
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={Globe2} title="Realm Memberships" />
        {realms.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-foreground-400">
            Not a member of any realm yet.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200/60">
            {realms.map((r) => (
              <div key={r.realmId} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {r.realmColor && (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.realmColor }} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.realmName}</p>
                    <p className="text-xs text-foreground-400">/{r.realmSlug} · joined {formatDate(r.joinedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.isPrimary && (
                    <span className="px-2 py-0.5 bg-primary-100 text-primary-700 border border-primary-300 rounded-full text-[10px] font-medium">Primary</span>
                  )}
                  {r.isRealmAdmin && (
                    <span className="px-2 py-0.5 bg-warning-100 text-warning-700 border border-warning-300 rounded-full text-[10px] font-medium">Admin</span>
                  )}
                  {r.isDefault && (
                    <span className="px-2 py-0.5 bg-background-200 text-foreground-500 border border-neutral-300 rounded-full text-[10px] font-medium">Default</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Appearance */}
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={Sun} title="Appearance" />
        <div className="p-5">
          <p className="text-sm text-foreground-500 mb-4">Choose how VaultysClaw looks on this device.</p>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "relative flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all text-center",
                  theme === value
                    ? "bg-primary-100 dark:bg-primary-600/15 border-primary-300 dark:border-primary-600/50 text-primary-700 dark:text-primary-300"
                    : "bg-background-200/50 border-neutral-300/50 text-foreground-500 hover:border-foreground-500 hover:text-foreground-700"
                )}
              >
                {theme === value && (
                  <span className="absolute top-2 right-2 w-4 h-4 bg-primary-600 rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
                <Icon className="w-5 h-5" />
                <div>
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="text-[11px] text-foreground-400 mt-0.5 leading-tight">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Debug / advanced */}
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <SectionHeader icon={FileText} title="Advanced" />
        <div className="p-5 space-y-0">
          {profile?.id && (
            <Row label="Internal ID" value={<span className="flex items-center gap-0.5"><span className="font-mono text-xs text-foreground-500">{profile.id}</span><CopyButton value={profile.id} /></span>} />
          )}
          <Row label="Auth Method" value="VaultysID (Ed25519 ECDSA)" />
          <Row label="Session Protocol" value="NextAuth.js" />
        </div>
      </section>

    </div>
  );
}
