"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Server,
  RefreshCw,
  Users,
  Mail,
  Send,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  Settings2,
  Eye,
  EyeOff,
  X,
  Check,
  ExternalLink,
  BookOpen,
  ChevronDown,
  Cpu,
  HardDrive,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerData {
  identity: Record<string, unknown> | null;
  stats: { totalAgents: number; onlineAgents: number; offlineAgents: number };
  sysInfo: {
    platform: string;
    osType: string;
    osRelease: string;
    hostname: string;
    uptime: number;
    totalMem: number;
    freeMem: number;
    cpuCount: number;
    cpuModel: string;
    loadAvg: number[];
    version: string;
  };
  walletUrl: string;
}

interface EntraGroup {
  id: string;
  displayName: string;
  description: string | null;
}

interface DiagnosticCheck {
  id: string;
  label: string;
  status: "ok" | "fail";
  detail: string | null;
  hint: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  showToggle,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showToggle?: boolean;
}) {
  const [show, setShow] = useState(false);
  const inputType = showToggle ? (show ? "text" : "password") : type;
  return (
    <div>
      <label htmlFor={id} className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 disabled:opacity-50 transition pr-9"
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vc-subtle hover:text-vc-text transition"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── SMTP Section ─────────────────────────────────────────────────────────────

function SmtpSection() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "ok" | "fail">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    fetch("/api/server/smtp")
      .then((r) => r.json())
      .then((d: { configured?: boolean; host?: string; port?: number; secure?: boolean; user?: string; password?: string; from?: string }) => {
        if (d.configured) {
          setHost(d.host ?? "");
          setPort(String(d.port ?? 587));
          setSecure(d.secure ?? false);
          setUser(d.user ?? "");
          setPassword(d.password ?? "");
          setFrom(d.from ?? "");
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const flash = (s: typeof status, msg = "") => {
    setStatus(s); setStatusMsg(msg);
    setTimeout(() => setStatus("idle"), 3500);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: parseInt(port, 10), secure, user, password, from }),
      });
      if (r.ok) flash("saved"); else flash("error", "Save failed");
    } catch { flash("error", "Save failed"); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: parseInt(port, 10), secure, user, password, from }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) flash("ok", "Connection successful");
      else flash("fail", d.error ?? "Test failed");
    } catch { flash("fail", "Test failed"); }
    finally { setTesting(false); }
  };

  return (
    <section className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
        <Mail className="w-4 h-4 text-vc-muted" />
        <h2 className="text-sm font-semibold text-vc-text">SMTP / Email</h2>
        <span className="text-xs text-vc-subtle ml-1">Used to send QR codes to users</span>
      </div>
      <form onSubmit={save} className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-vc-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="SMTP Host" id="smtp-host" value={host} onChange={setHost} placeholder="smtp.example.com" />
              <div className="flex gap-3">
                <div className="flex-1">
                  <Field label="Port" id="smtp-port" value={port} onChange={setPort} placeholder="587" />
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium">TLS</label>
                  <button
                    type="button"
                    onClick={() => setSecure((s) => !s)}
                    className={cn(
                      "mt-1 w-11 h-6 rounded-full relative transition-colors",
                      secure ? "bg-indigo-600" : "bg-vc-ring",
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                      secure && "translate-x-5",
                    )} />
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Username" id="smtp-user" value={user} onChange={setUser} placeholder="user@example.com" />
              <Field label="Password" id="smtp-pass" value={password} onChange={setPassword} showToggle />
            </div>
            <Field label="From address" id="smtp-from" value={from} onChange={setFrom} placeholder="no-reply@example.com" />
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
              <button
                type="button"
                onClick={test}
                disabled={testing || !host}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-vc-raised border border-vc-ring hover:border-vc-muted text-vc-text disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Test connection
              </button>
              {status === "saved" && <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>}
              {status === "ok" && <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" />{statusMsg}</span>}
              {(status === "error" || status === "fail") && <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{statusMsg}</span>}
            </div>
          </>
        )}
      </form>
    </section>
  );
}

// ─── Server Settings Section ─────────────────────────────────────────────────

function ServerSettingsSection() {
  const [walletUrl, setWalletUrl] = useState("");
  const [peerjsHost, setPeerjsHost] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    fetch("/api/server/settings")
      .then((r) => r.json())
      .then((d: { walletUrl?: string; peerjsHost?: string }) => {
        setWalletUrl(d.walletUrl ?? "https://wallet.vaultys.net");
        setPeerjsHost(d.peerjsHost ?? "");
      })
      .catch(() => {
        setStatus("error");
        setStatusMsg("Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const flash = (s: "saved" | "error", msg = "") => {
    setStatus(s);
    setStatusMsg(msg);
    setTimeout(() => setStatus("idle"), 3500);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/server/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletUrl, peerjsHost }),
      });
      if (r.ok) flash("saved");
      else flash("error", "Save failed");
    } catch {
      flash("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-vc-muted" />
        <h2 className="text-sm font-semibold text-vc-text">Connection Settings</h2>
        <span className="text-xs text-vc-subtle ml-1">Wallet and PeerJS endpoints</span>
      </div>
      <form onSubmit={save} className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-vc-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <Field
              label="Wallet URL"
              id="server-wallet-url"
              type="url"
              value={walletUrl}
              onChange={setWalletUrl}
              placeholder="https://wallet.vaultys.net"
            />
            <Field
              label="PeerJS Host"
              id="server-peerjs-host"
              value={peerjsHost}
              onChange={setPeerjsHost}
              placeholder="Leave empty to use the default PeerJS relay"
            />
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
              {status === "saved" && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />Saved
                </span>
              )}
              {status === "error" && (
                <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{statusMsg}
                </span>
              )}
            </div>
          </>
        )}
      </form>
    </section>
  );
}

// ─── Entra Setup Guide ───────────────────────────────────────────────────────

const PILL = "font-mono text-xs bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded";
const BOLD = "font-semibold text-gray-900 dark:text-vc-text";
const LINK = "text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 inline-flex items-center gap-0.5 underline underline-offset-2";

const STEPS = [
  {
    number: "1",
    title: "Create an App Registration",
    body: (
      <>
        Open the{" "}
        <a
          href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
          target="_blank" rel="noreferrer"
          className={LINK}
        >
          Microsoft Entra ID → App registrations
          <ExternalLink className="w-3 h-3" />
        </a>{" "}
        blade and click <strong className={BOLD}>New registration</strong>. Give it a name
        (e.g. <em>VaultysClaw Sync</em>), leave the redirect URI blank, and click{" "}
        <strong className={BOLD}>Register</strong>.
      </>
    ),
  },
  {
    number: "2",
    title: "Copy the Tenant ID and Client ID",
    body: (
      <>
        On the app&apos;s <strong className={BOLD}>Overview</strong> page you will see two GUIDs:{" "}
        <span className={PILL}>Application (client) ID</span> → paste into{" "}
        <strong className={BOLD}>Client ID</strong>, and{" "}
        <span className={PILL}>Directory (tenant) ID</span> → paste into{" "}
        <strong className={BOLD}>Tenant ID</strong> below.
      </>
    ),
  },
  {
    number: "3",
    title: "Create a Client Secret",
    body: (
      <>
        In the left sidebar go to <strong className={BOLD}>Certificates &amp; secrets</strong> →{" "}
        <strong className={BOLD}>Client secrets</strong> →{" "}
        <strong className={BOLD}>New client secret</strong>. Choose an expiry, click{" "}
        <strong className={BOLD}>Add</strong>, then immediately copy the{" "}
        <strong className={BOLD}>Value</strong> column (it is only shown once) into the{" "}
        <em>Client Secret</em> field below.
      </>
    ),
  },
  {
    number: "4",
    title: "Grant API permissions",
    body: (
      <>
        Go to <strong className={BOLD}>API permissions</strong> →{" "}
        <strong className={BOLD}>Add a permission</strong> →{" "}
        <strong className={BOLD}>Microsoft Graph</strong>. In the panel that opens, choose{" "}
        <strong className={BOLD}>Application permissions</strong>{" "}
        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700/60 rounded px-1.5 py-0.5">
          ⚠ not Delegated
        </span>
        , then search for and add:
        <ul className="mt-2 space-y-1.5 pl-1">
          {[
            { perm: "User.Read.All", why: "read user profiles and email addresses" },
            { perm: "Group.Read.All", why: "list groups and their members" },
          ].map(({ perm, why }) => (
            <li key={perm} className="flex items-start gap-2">
              <span className={cn(PILL, "shrink-0 mt-0.5")}>{perm}</span>
              <span className="text-gray-500 dark:text-vc-subtle">— {why}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/50 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            After adding both permissions you <strong>must</strong> click{" "}
            <strong>Grant admin consent for [your organisation]</strong> at the top of the
            permissions list, then confirm. Without this step the app has no effective access
            and all API calls will return 403.
          </span>
        </div>
      </>
    ),
  },
];

function EntraSetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-indigo-100/70 dark:hover:bg-indigo-950/50 transition"
      >
        <BookOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex-1">
          How to get these credentials from the Azure portal
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-indigo-500 dark:text-indigo-400 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-5 pt-2 space-y-4 border-t border-indigo-200 dark:border-indigo-800/40">
          {STEPS.map((step) => (
            <div key={step.number} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-200 dark:bg-indigo-600/30 border border-indigo-400 dark:border-indigo-600/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.number}
              </span>
              <div className="text-sm text-gray-600 dark:text-vc-muted leading-relaxed">
                <span className="font-semibold text-gray-800 dark:text-vc-text-2">{step.title} — </span>
                {step.body}
              </div>
            </div>
          ))}

          <div className="flex items-start gap-2 pt-3 border-t border-indigo-200 dark:border-indigo-800/30">
            <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed">
              The client secret value is only visible immediately after creation. Store it securely
              — if lost you will need to create a new one.
            </p>
          </div>

          <a
            href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition"
          >
            <ExternalLink className="w-3 h-3" />
            Full Microsoft documentation
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Entra Sync Wizard ────────────────────────────────────────────────────────

type WizardStep = "config" | "groups" | "realm-map" | "confirm" | "syncing" | "done";

interface SyncResult { created: number; skipped: number; updated: number; errors: string[] }

function EntraSection() {
  // Entra config
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configStatus, setConfigStatus] = useState<"idle" | "saved" | "error">("idle");
  const [checking, setChecking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[] | null>(null);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("groups");
  const [groups, setGroups] = useState<EntraGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [mapGroups, setMapGroups] = useState(false);
  const [realmMap, setRealmMap] = useState<Record<string, string>>({});
  const [realms, setRealms] = useState<{ id: string; name: string }[]>([]);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Unclaimed users summary
  const [unclaimedCount, setUnclaimedCount] = useState(0);
  const [unclaimedLoading, setUnclaimedLoading] = useState(false);

  useEffect(() => {
    fetch("/api/server/entra")
      .then((r) => r.json())
      .then((d: { configured?: boolean; tenantId?: string; clientId?: string; clientSecret?: string }) => {
        if (d.configured) {
          setTenantId(d.tenantId ?? "");
          setClientId(d.clientId ?? "");
          setClientSecret(d.clientSecret ?? "");
        }
      })
      .catch(() => { })
      .finally(() => setConfigLoading(false));

    loadUnclaimed();
  }, []);

  const loadUnclaimed = () => {
    setUnclaimedLoading(true);
    fetch("/api/server/entra/unclaimed")
      .then((r) => r.json())
      .then((d: { users?: unknown[] }) => setUnclaimedCount(d.users?.length ?? 0))
      .catch(() => { })
      .finally(() => setUnclaimedLoading(false));
  };

  const flashConfig = (s: "saved" | "error") => {
    setConfigStatus(s);
    setTimeout(() => setConfigStatus("idle"), 3000);
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    try {
      const r = await fetch("/api/server/entra", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, clientId, clientSecret }),
      });
      if (r.ok) flashConfig("saved"); else flashConfig("error");
    } catch { flashConfig("error"); }
    finally { setConfigSaving(false); }
  };

  const checkConnection = async () => {
    setChecking(true);
    setDiagnostics(null);
    try {
      const r = await fetch("/api/server/entra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, clientId, clientSecret }),
      });
      const d = await r.json() as { ok?: boolean; checks?: DiagnosticCheck[]; groups?: EntraGroup[] };
      setDiagnostics(d.checks ?? []);
    } catch {
      setDiagnostics([{ id: "network", label: "Reach API endpoint", status: "fail", detail: "Network error", hint: "Could not reach the server. Check your internet connection." }]);
    } finally {
      setChecking(false);
    }
  };

  // ── Wizard ──

  const openWizard = async () => {
    setWizardOpen(true);
    setWizardStep("groups");
    setSelectedGroups(new Set());
    setMapGroups(false);
    setRealmMap({});
    setSyncResult(null);
    setGroupsError(null);
    setGroupsLoading(true);

    // Load groups + realms in parallel — pass current field values so unsaved
    // edits are used without requiring the admin to save first.
    const [groupsRes, realmsRes] = await Promise.allSettled([
      fetch("/api/server/entra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, clientId, clientSecret }),
      }).then((r) => r.json()),
      fetch("/api/realms").then((r) => r.json()),
    ]);

    if (groupsRes.status === "fulfilled") {
      const d = groupsRes.value as { ok?: boolean; checks?: DiagnosticCheck[]; groups?: EntraGroup[]; error?: string };
      if (d.ok) {
        setGroups(d.groups ?? []);
        // Persist diagnostic results so they're visible in the config card too
        if (d.checks) setDiagnostics(d.checks);
      } else {
        if (d.checks) setDiagnostics(d.checks);
        const failedCheck = d.checks?.find((c) => c.status === "fail");
        setGroupsError(failedCheck?.hint ?? failedCheck?.detail ?? d.error ?? "Failed to connect to Entra");
      }
    } else {
      setGroupsError("Failed to connect to Entra");
    }

    if (realmsRes.status === "fulfilled") {
      const d = realmsRes.value as { realms?: { id: string; name: string }[] };
      setRealms(d.realms ?? []);
    }

    setGroupsLoading(false);
  };

  const toggleGroup = (id: string) =>
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const doSync = async () => {
    setWizardStep("syncing");
    // Build groupNames map from the fetched groups list
    const groupNames: Record<string, string> = {};
    for (const g of groups) groupNames[g.id] = g.displayName;

    try {
      const r = await fetch("/api/server/entra/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupIds: Array.from(selectedGroups),
          groupRealmMap: mapGroups ? realmMap : {},
          groupNames,
        }),
      });
      const result = await r.json() as SyncResult;
      setSyncResult(result);
      setWizardStep("done");
      loadUnclaimed();
    } catch {
      setSyncResult({ created: 0, skipped: 0, updated: 0, errors: ["Sync request failed"] });
      setWizardStep("done");
    }
  };

  const configured = tenantId && clientId && clientSecret;

  return (
    <>
      {/* Entra config card */}
      <section className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
          <Users className="w-4 h-4 text-vc-muted" />
          <h2 className="text-sm font-semibold text-vc-text">Microsoft Entra ID</h2>
          <span className="text-xs text-vc-subtle ml-1">App registration credentials</span>
        </div>
        <form onSubmit={saveConfig} className="p-5 space-y-4">
          {configLoading ? (
            <div className="flex items-center gap-2 text-vc-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <EntraSetupGuide />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Tenant ID" id="entra-tenant" value={tenantId} onChange={setTenantId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                <Field label="Client ID" id="entra-client" value={clientId} onChange={setClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <Field label="Client Secret" id="entra-secret" value={clientSecret} onChange={setClientSecret} showToggle placeholder="Your app secret value" />
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <button
                  type="submit"
                  disabled={configSaving}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  {configSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
                {configured && (
                  <button
                    type="button"
                    onClick={checkConnection}
                    disabled={checking}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-vc-raised border border-vc-ring hover:border-vc-muted text-vc-text disabled:opacity-40 transition flex items-center gap-1.5"
                  >
                    {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Check connection
                  </button>
                )}
                {configured && diagnostics?.every((c) => c.status === "ok") && (
                  <button
                    type="button"
                    onClick={openWizard}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-vc-raised border border-vc-ring hover:border-indigo-500 text-vc-text transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" /> Sync users…
                  </button>
                )}
                {configStatus === "saved" && <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>}
                {configStatus === "error" && <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Save failed</span>}
              </div>

              <div className="rounded-lg border border-vc-border bg-vc-raised px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-vc-text">Pending claims</p>
                  <p className="text-xs text-vc-muted">
                    {unclaimedLoading ? "Checking unclaimed users…" : `${unclaimedCount} user${unclaimedCount === 1 ? "" : "s"} waiting to claim an account.`}
                  </p>
                </div>
                <Link
                  href="/users"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-vc-surface border border-vc-ring hover:border-indigo-500 text-vc-text transition"
                >
                  <Users className="w-3 h-3" />
                  View users
                </Link>
              </div>

              {/* Diagnostic results */}
              {diagnostics && (
                <div className="rounded-lg border border-vc-border overflow-hidden mt-1">
                  {diagnostics.map((check, i) => (
                    <div
                      key={check.id}
                      className={cn(
                        "px-4 py-3 space-y-1",
                        i < diagnostics.length - 1 && "border-b border-vc-border",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {check.status === "ok"
                          ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                          : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        <span className={cn(
                          "text-sm font-medium",
                          check.status === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
                        )}>
                          {check.label}
                        </span>
                      </div>
                      {check.status === "fail" && check.hint && (
                        <p className="text-xs text-gray-600 dark:text-vc-muted pl-6 leading-relaxed">
                          {check.hint}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </form>
      </section>

      {/* ── Wizard modal ── */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-vc-surface border border-vc-ring rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-vc-border shrink-0">
              <h2 className="text-vc-text font-semibold">Sync Entra Users</h2>
              {wizardStep !== "syncing" && (
                <button onClick={() => setWizardOpen(false)} className="text-vc-muted hover:text-vc-text">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">

              {/* Step: groups */}
              {wizardStep === "groups" && (
                <div className="space-y-4">
                  <p className="text-sm text-vc-muted">
                    Select which Entra groups to import. Leave everything unselected to import all users in the tenant.
                  </p>
                  {groupsLoading && (
                    <div className="flex items-center gap-2 text-vc-muted text-sm py-4">
                      <Loader2 className="w-4 h-4 animate-spin" /> Fetching groups…
                    </div>
                  )}
                  {groupsError && (
                    <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{groupsError}
                    </div>
                  )}
                  {!groupsLoading && !groupsError && (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {groups.map((g) => (
                        <label key={g.id} className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition",
                          selectedGroups.has(g.id)
                            ? "bg-indigo-100 dark:bg-indigo-600/15 border-indigo-300 dark:border-indigo-600/50"
                            : "bg-vc-raised border-vc-ring hover:border-vc-muted",
                        )}>
                          <input
                            type="checkbox"
                            checked={selectedGroups.has(g.id)}
                            onChange={() => toggleGroup(g.id)}
                            className="accent-indigo-500"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-vc-text">{g.displayName}</p>
                            {g.description && <p className="text-xs text-vc-subtle truncate">{g.description}</p>}
                          </div>
                        </label>
                      ))}
                      {groups.length === 0 && (
                        <p className="text-sm text-vc-subtle text-center py-6">No groups found in this tenant.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step: realm-map */}
              {wizardStep === "realm-map" && (
                <div className="space-y-4">
                  <p className="text-sm text-vc-muted">
                    Do you want to map Entra groups to VaultysClaw realms? Synced users will be automatically added to the corresponding realm.
                  </p>
                  <div className="flex gap-3">
                    {[{ v: false, label: "No, skip" }, { v: true, label: "Yes, map groups" }].map(({ v, label }) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setMapGroups(v)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl border text-sm font-medium transition",
                          mapGroups === v
                            ? "bg-indigo-50 dark:bg-indigo-600/20 border-indigo-300 dark:border-indigo-600/60 text-indigo-700 dark:text-indigo-300"
                            : "bg-vc-raised border-vc-ring text-vc-muted hover:border-vc-muted",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {mapGroups && selectedGroups.size > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {Array.from(selectedGroups).map((gid) => {
                        const g = groups.find((x) => x.id === gid);
                        const selected = realmMap[gid] ?? "";
                        return (
                          <div key={gid} className="flex items-center gap-2">
                            <span className="text-xs text-vc-text-2 shrink-0 w-36 truncate" title={g?.displayName ?? gid}>
                              {g?.displayName ?? gid}
                            </span>
                            <ChevronRight className="w-3 h-3 text-vc-subtle shrink-0" />
                            <select
                              value={selected}
                              onChange={(e) => setRealmMap((m) => ({ ...m, [gid]: e.target.value }))}
                              className="flex-1 bg-vc-raised border border-vc-ring rounded-lg px-2 py-1 text-xs text-vc-text focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">— no realm —</option>
                              <option value="__create__">✦ Create realm from group name</option>
                              {realms.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                            {selected === "__create__" && (
                              <span className="text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">
                                new: {g?.displayName ?? gid}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {mapGroups && selectedGroups.size === 0 && (
                    <p className="text-xs text-vc-subtle">No groups selected — all users will be imported without realm assignment.</p>
                  )}
                </div>
              )}

              {/* Step: confirm */}
              {wizardStep === "confirm" && (
                <div className="space-y-4">
                  <p className="text-sm text-vc-muted">Ready to sync. Review your selection:</p>
                  <div className="bg-vc-raised border border-vc-ring rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-vc-subtle">Groups</span>
                      <span className="text-vc-text-2">{selectedGroups.size === 0 ? "All tenant users" : `${selectedGroups.size} group(s)`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-vc-subtle">Realm mapping</span>
                      <span className="text-vc-text-2">{mapGroups ? "Enabled" : "Disabled"}</span>
                    </div>
                    {mapGroups && Object.values(realmMap).some((v) => v === "__create__") && (
                      <div className="pt-1 space-y-1 border-t border-vc-border">
                        <p className="text-xs text-vc-subtle font-medium">New realms to be created:</p>
                        {Array.from(selectedGroups)
                          .filter((gid) => realmMap[gid] === "__create__")
                          .map((gid) => {
                            const g = groups.find((x) => x.id === gid);
                            return (
                              <div key={gid} className="flex items-center gap-2">
                                <span className="text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50 rounded px-1.5 py-0.5">
                                  {g?.displayName ?? gid}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-vc-border">
                      <span className="text-vc-subtle">Deduplication</span>
                      <span className="text-vc-text-2">By email address</span>
                    </div>
                  </div>
                  <p className="text-xs text-vc-subtle">
                    New users will be created as unclaimed accounts. They must scan a QR code with their Vaultys wallet to activate their account.
                  </p>
                </div>
              )}

              {/* Step: syncing */}
              {wizardStep === "syncing" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-8 h-8 text-indigo-700 dark:text-indigo-400 animate-spin" />
                  <p className="text-sm text-vc-muted">Syncing users from Entra…</p>
                </div>
              )}

              {/* Step: done */}
              {wizardStep === "done" && syncResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-vc-text">Sync complete</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Created", value: syncResult.created, color: "text-emerald-700 dark:text-emerald-400" },
                      { label: "Updated", value: syncResult.updated, color: "text-blue-700 dark:text-blue-400" },
                      { label: "Skipped", value: syncResult.skipped, color: "text-vc-muted" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-vc-raised border border-vc-ring rounded-lg p-3 text-center">
                        <p className={cn("text-2xl font-bold", color)}>{value}</p>
                        <p className="text-xs text-vc-subtle mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {syncResult.errors.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-lg p-3 space-y-1 max-h-36 overflow-y-auto">
                      {syncResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600 dark:text-red-300">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer nav */}
            {wizardStep !== "syncing" && (
              <div className="flex justify-between gap-3 px-6 py-4 border-t border-vc-border shrink-0">
                <button
                  onClick={() => {
                    if (wizardStep === "done" || wizardStep === "groups") { setWizardOpen(false); return; }
                    if (wizardStep === "realm-map") setWizardStep("groups");
                    if (wizardStep === "confirm") setWizardStep("realm-map");
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-vc-raised border border-vc-ring hover:border-vc-muted text-vc-text transition"
                >
                  {wizardStep === "done" || wizardStep === "groups" ? "Close" : "Back"}
                </button>
                {wizardStep !== "done" && (
                  <button
                    onClick={() => {
                      if (wizardStep === "groups") { setWizardStep("realm-map"); return; }
                      if (wizardStep === "realm-map") { setWizardStep("confirm"); return; }
                      if (wizardStep === "confirm") doSync();
                    }}
                    disabled={groupsLoading || !!groupsError}
                    className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition flex items-center gap-2"
                  >
                    {wizardStep === "confirm" ? <><RefreshCw className="w-3.5 h-3.5" /> Start sync</> : <>Next <ChevronRight className="w-3.5 h-3.5" /></>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "overview" | "settings" | "integrations";

export default function ServerPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { isAdmin?: boolean; isOwner?: boolean } | undefined)?.isAdmin
    || (session?.user as { isOwner?: boolean } | undefined)?.isOwner;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [data, setData] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/server");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ServerData = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: Server },
    ...(isAdmin
      ? [
        { id: "settings" as Tab, label: "Settings", icon: Settings2 },
        { id: "integrations" as Tab, label: "Integrations", icon: Network },
      ]
      : []),
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-vc-muted text-sm">Loading server info…</p>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-xl px-4 py-3 text-red-600 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-vc-raised border border-vc-ring rounded-xl p-1 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition",
              activeTab === id
                ? "bg-vc-surface text-vc-text shadow-sm"
                : "text-vc-muted hover:text-vc-text",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (
        <>
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-vc-surface p-5 rounded-xl border border-vc-border">
                <div className="text-vc-muted text-xs uppercase tracking-wider mb-1">Registered Agents</div>
                <div className="text-3xl font-bold text-vc-text">{data.stats.totalAgents}</div>
              </div>
              <div className="bg-vc-surface p-5 rounded-xl border border-vc-border">
                <div className="text-vc-muted text-xs uppercase tracking-wider mb-1">Online Now</div>
                <div className="text-3xl font-bold text-green-700 dark:text-green-400">{data.stats.onlineAgents}</div>
              </div>
              <div className="bg-vc-surface p-5 rounded-xl border border-vc-border">
                <div className="text-vc-muted text-xs uppercase tracking-wider mb-1">Offline</div>
                <div className="text-3xl font-bold text-gray-500">{data.stats.offlineAgents}</div>
              </div>
            </div>
          )}

          <section className="bg-vc-surface rounded-xl border border-vc-border p-5">
            <h2 className="text-sm font-semibold text-vc-text mb-4">Server VaultysID</h2>
            {data?.identity ? (
              <pre className="bg-vc-raised rounded p-4 text-sm font-mono text-vc-text-2 overflow-x-auto">
                {JSON.stringify(data.identity, null, 2)}
              </pre>
            ) : (
              <p className="text-vc-muted text-sm">Server identity not configured.</p>
            )}
          </section>

          {data?.sysInfo && (
            <section className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
              <div className="px-5 py-4 border-b border-vc-border flex items-center gap-2">
                <Cpu className="w-4 h-4 text-vc-muted" />
                <h2 className="text-sm font-semibold text-vc-text">System Info</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: "Hostname", value: data.sysInfo.hostname },
                  { label: "Platform", value: `${data.sysInfo.osType} ${data.sysInfo.osRelease}` },
                  { label: "Runtime", value: data.sysInfo.platform },
                  { label: "Uptime", value: formatUptime(data.sysInfo.uptime) },
                  { label: "Version", value: data.sysInfo.version },
                  { label: "Wallet URL", value: data.walletUrl },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-vc-raised border border-vc-ring rounded-lg p-4 min-w-0">
                    <div className="text-vc-subtle text-xs uppercase tracking-wider mb-1">{label}</div>
                    <div className="text-sm font-medium text-vc-text truncate" title={String(value)}>{value}</div>
                  </div>
                ))}
                <div className="bg-vc-raised border border-vc-ring rounded-lg p-4 min-w-0">
                  <div className="text-vc-subtle text-xs uppercase tracking-wider mb-1">CPU</div>
                  <div className="text-sm font-medium text-vc-text truncate" title={data.sysInfo.cpuModel}>
                    {data.sysInfo.cpuCount} cores · {data.sysInfo.cpuModel}
                  </div>
                </div>
                <div className="bg-vc-raised border border-vc-ring rounded-lg p-4 min-w-0">
                  <div className="text-vc-subtle text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> Memory
                  </div>
                  <div className="text-sm font-medium text-vc-text">
                    {formatBytes(data.sysInfo.totalMem - data.sysInfo.freeMem)} / {formatBytes(data.sysInfo.totalMem)}
                  </div>
                </div>
                <div className="bg-vc-raised border border-vc-ring rounded-lg p-4 min-w-0">
                  <div className="text-vc-subtle text-xs uppercase tracking-wider mb-1">Load Average</div>
                  <div className="text-sm font-medium text-vc-text">
                    {data.sysInfo.loadAvg.map((load) => load.toFixed(2)).join(" / ")}
                  </div>
                </div>
              </div>
            </section>
          )}

        </>
      )}

      {/* ── Settings tab (admin-only) ── */}
      {activeTab === "settings" && isAdmin && (
        <ServerSettingsSection />
      )}

      {/* ── Integrations tab (admin-only) ── */}
      {activeTab === "integrations" && isAdmin && (
        <div className="space-y-6">
          <EntraSection />
          <SmtpSection />
        </div>
      )}
    </div>
  );
}
