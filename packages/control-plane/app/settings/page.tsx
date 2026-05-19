"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { Sun, Moon, Monitor, Check, Shield, Key, Info, User } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: Theme; label: string; description: string; icon: React.ElementType }[] = [
  { value: "dark", label: "Dark", description: "Always use dark theme", icon: Moon },
  { value: "light", label: "Light", description: "Always use light theme", icon: Sun },
  { value: "system", label: "System", description: "Follow OS preference", icon: Monitor },
];

function shortDid(did: string): string {
  if (did.length <= 32) return did;
  return `${did.slice(0, 20)}…${did.slice(-10)}`;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const did = (session?.user as { did?: string } | undefined)?.did ?? "—";
  const isOwner = (session?.user as { isOwner?: boolean } | undefined)?.isOwner ?? false;

  // Profile state
  const [profileName, setProfileName] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [nameLoading, setNameLoading] = useState(true);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((data: { name?: string | null }) => {
        const n = data.name ?? "";
        setProfileName(n);
        setSavedName(n);
      })
      .catch(() => { })
      .finally(() => setNameLoading(false));
  }, [session?.user]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameSaving(true);
    setNameStatus("idle");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName }),
      });
      if (res.ok) {
        const data = await res.json() as { name?: string | null };
        const updated = data.name ?? "";
        setSavedName(updated);
        setProfileName(updated);
        setNameStatus("saved");
        setTimeout(() => setNameStatus("idle"), 2500);
      } else {
        setNameStatus("error");
      }
    } catch {
      setNameStatus("error");
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Profile */}
      <section className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
          <User className="w-4 h-4 text-vc-muted" />
          <h2 className="text-sm font-semibold text-vc-text">Profile</h2>
        </div>
        <div className="p-5">
          <form onSubmit={saveName} className="flex flex-col gap-3">
            <div>
              <label htmlFor="display-name" className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">
                Display name
              </label>
              <input
                id="display-name"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                disabled={nameLoading || nameSaving}
                maxLength={128}
                placeholder={nameLoading ? "Loading…" : "Your name"}
                className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 disabled:opacity-50 transition"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={nameLoading || nameSaving || profileName === savedName}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {nameSaving ? "Saving…" : "Save"}
              </button>
              {nameStatus === "saved" && (
                <span className="text-xs text-emerald-500 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
              {nameStatus === "error" && (
                <span className="text-xs text-red-600 dark:text-red-400">Failed to save</span>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Appearance */}
      <section className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
          <Sun className="w-4 h-4 text-vc-muted" />
          <h2 className="text-sm font-semibold text-vc-text">Appearance</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-vc-muted mb-4">Choose how VaultysClaw looks on this device.</p>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "relative flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all text-center",
                  theme === value
                    ? "bg-indigo-100 dark:bg-indigo-600/15 border-indigo-300 dark:border-indigo-600/50 text-indigo-700 dark:text-indigo-300"
                    : "bg-vc-raised/50 border-vc-ring/50 text-vc-muted hover:border-vc-muted hover:text-vc-text-2"
                )}
              >
                {theme === value && (
                  <span className="absolute top-2 right-2 w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
                <Icon className="w-5 h-5" />
                <div>
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="text-[11px] text-vc-subtle mt-0.5 leading-tight">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Account */}
      <section className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
          <Shield className="w-4 h-4 text-vc-muted" />
          <h2 className="text-sm font-semibold text-vc-text">Account</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">
              Decentralized Identity (DID)
            </label>
            <div className="flex items-center gap-2 bg-vc-raised border border-vc-ring rounded-lg px-3 py-2.5">
              <Key className="w-3.5 h-3.5 text-vc-subtle shrink-0" />
              <span className="text-xs font-mono text-vc-text-2 truncate flex-1">{did}</span>
              {isOwner && (
                <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800/60 rounded-full text-[10px] font-medium shrink-0">
                  Owner
                </span>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/40 rounded-lg px-3 py-2.5">
            <Info className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" />
            <p className="text-xs text-indigo-700 dark:text-indigo-300/70 leading-relaxed">
              Your identity is managed by your VaultysID wallet. To change it, re-authenticate
              with a different wallet.
            </p>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
          <Info className="w-4 h-4 text-vc-muted" />
          <h2 className="text-sm font-semibold text-vc-text">About</h2>
        </div>
        <div className="p-5 space-y-2 text-sm">
          {[
            { label: "Application", value: "VaultysClaw Control Plane" },
            { label: "Authentication", value: "VaultysID (Ed25519)" },
            { label: "Communication", value: "WebSocket + msgpack" },
            { label: "Storage", value: "SQLite (better-sqlite3)" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-1.5 border-b border-vc-border/60 last:border-0">
              <span className="text-vc-subtle">{label}</span>
              <span className="text-vc-text-2 text-right">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
