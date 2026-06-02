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
  Key,
  Plus,
  Trash2,
  Copy,
  Globe,
  ChevronUp,
  Pencil,
} from "lucide-react";
import { ROUTE_REGISTRY } from "@/lib/route-registry";
import type { ApiKey } from "@/lib/api-types";
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
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
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
      <label
        htmlFor={id}
        className="text-xs text-foreground-400 uppercase tracking-wider font-medium block mb-1.5"
      >
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
          className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 disabled:opacity-50 transition pr-9"
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-400 hover:text-foreground transition"
          >
            {show ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
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
  const [status, setStatus] = useState<
    "idle" | "saved" | "error" | "ok" | "fail"
  >("idle");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    fetch("/api/server/smtp")
      .then((r) => r.json())
      .then(
        (d: {
          configured?: boolean;
          host?: string;
          port?: number;
          secure?: boolean;
          user?: string;
          password?: string;
          from?: string;
        }) => {
          if (d.configured) {
            setHost(d.host ?? "");
            setPort(String(d.port ?? 587));
            setSecure(d.secure ?? false);
            setUser(d.user ?? "");
            setPassword(d.password ?? "");
            setFrom(d.from ?? "");
          }
        }
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const flash = (s: typeof status, msg = "") => {
    setStatus(s);
    setStatusMsg(msg);
    setTimeout(() => setStatus("idle"), 3500);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port: parseInt(port, 10),
          secure,
          user,
          password,
          from,
        }),
      });
      if (r.ok) flash("saved");
      else flash("error", "Save failed");
    } catch {
      flash("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port: parseInt(port, 10),
          secure,
          user,
          password,
          from,
        }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) flash("ok", "Connection successful");
      else flash("fail", d.error ?? "Test failed");
    } catch {
      flash("fail", "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
        <Mail className="w-4 h-4 text-foreground-500" />
        <h2 className="text-sm font-semibold text-foreground">SMTP / Email</h2>
        <span className="text-xs text-foreground-400 ml-1">
          Used to send QR codes to users
        </span>
      </div>
      <form onSubmit={save} className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="SMTP Host"
                id="smtp-host"
                value={host}
                onChange={setHost}
                placeholder="smtp.example.com"
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <Field
                    label="Port"
                    id="smtp-port"
                    value={port}
                    onChange={setPort}
                    placeholder="587"
                  />
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <label className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
                    TLS
                  </label>
                  <button
                    type="button"
                    onClick={() => setSecure((s) => !s)}
                    className={cn(
                      "mt-1 w-11 h-6 rounded-full relative transition-colors",
                      secure ? "bg-indigo-600" : "bg-neutral-300"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                        secure && "translate-x-5"
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Username"
                id="smtp-user"
                value={user}
                onChange={setUser}
                placeholder="user@example.com"
              />
              <Field
                label="Password"
                id="smtp-pass"
                value={password}
                onChange={setPassword}
                showToggle
              />
            </div>
            <Field
              label="From address"
              id="smtp-from"
              value={from}
              onChange={setFrom}
              placeholder="no-reply@example.com"
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
              <button
                type="button"
                onClick={test}
                disabled={testing || !host}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {testing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                Test connection
              </button>
              {status === "saved" && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              {status === "ok" && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {statusMsg}
                </span>
              )}
              {(status === "error" || status === "fail") && (
                <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {statusMsg}
                </span>
              )}
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
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-foreground-500" />
        <h2 className="text-sm font-semibold text-foreground">
          Connection Settings
        </h2>
        <span className="text-xs text-foreground-400 ml-1">
          Wallet and PeerJS endpoints
        </span>
      </div>
      <form onSubmit={save} className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
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
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              {status === "error" && (
                <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {statusMsg}
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

const PILL =
  "font-mono text-xs bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded";
const BOLD = "font-semibold text-gray-900 dark:text-foreground";
const LINK =
  "text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 inline-flex items-center gap-0.5 underline underline-offset-2";

const STEPS = [
  {
    number: "1",
    title: "Create an App Registration",
    body: (
      <>
        Open the{" "}
        <a
          href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
          target="_blank"
          rel="noreferrer"
          className={LINK}
        >
          Microsoft Entra ID → App registrations
          <ExternalLink className="w-3 h-3" />
        </a>{" "}
        blade and click <strong className={BOLD}>New registration</strong>. Give
        it a name (e.g. <em>VaultysClaw Sync</em>), leave the redirect URI
        blank, and click <strong className={BOLD}>Register</strong>.
      </>
    ),
  },
  {
    number: "2",
    title: "Copy the Tenant ID and Client ID",
    body: (
      <>
        On the app&apos;s <strong className={BOLD}>Overview</strong> page you
        will see two GUIDs:{" "}
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
        In the left sidebar go to{" "}
        <strong className={BOLD}>Certificates &amp; secrets</strong> →{" "}
        <strong className={BOLD}>Client secrets</strong> →{" "}
        <strong className={BOLD}>New client secret</strong>. Choose an expiry,
        click <strong className={BOLD}>Add</strong>, then immediately copy the{" "}
        <strong className={BOLD}>Value</strong> column (it is only shown once)
        into the <em>Client Secret</em> field below.
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
        <strong className={BOLD}>Microsoft Graph</strong>. In the panel that
        opens, choose <strong className={BOLD}>Application permissions</strong>{" "}
        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700/60 rounded px-1.5 py-0.5">
          ⚠ not Delegated
        </span>
        , then search for and add:
        <ul className="mt-2 space-y-1.5 pl-1">
          {[
            {
              perm: "User.Read.All",
              why: "read user profiles and email addresses",
            },
            { perm: "Group.Read.All", why: "list groups and their members" },
          ].map(({ perm, why }) => (
            <li key={perm} className="flex items-start gap-2">
              <span className={cn(PILL, "shrink-0 mt-0.5")}>{perm}</span>
              <span className="text-gray-500 dark:text-foreground-400">— {why}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/50 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            After adding both permissions you <strong>must</strong> click{" "}
            <strong>Grant admin consent for [your organisation]</strong> at the
            top of the permissions list, then confirm. Without this step the app
            has no effective access and all API calls will return 403.
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
            open && "rotate-180"
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
              <div className="text-sm text-gray-600 dark:text-foreground-500 leading-relaxed">
                <span className="font-semibold text-gray-800 dark:text-foreground-700">
                  {step.title} —{" "}
                </span>
                {step.body}
              </div>
            </div>
          ))}

          <div className="flex items-start gap-2 pt-3 border-t border-indigo-200 dark:border-indigo-800/30">
            <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed">
              The client secret value is only visible immediately after
              creation. Store it securely — if lost you will need to create a
              new one.
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

type WizardStep =
  | "config"
  | "groups"
  | "realm-map"
  | "confirm"
  | "syncing"
  | "done";

interface SyncResult {
  created: number;
  skipped: number;
  updated: number;
  errors: string[];
}

function EntraSection() {
  // Entra config
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configStatus, setConfigStatus] = useState<"idle" | "saved" | "error">(
    "idle"
  );
  const [checking, setChecking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[] | null>(
    null
  );

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
      .then(
        (d: {
          configured?: boolean;
          tenantId?: string;
          clientId?: string;
          clientSecret?: string;
        }) => {
          if (d.configured) {
            setTenantId(d.tenantId ?? "");
            setClientId(d.clientId ?? "");
            setClientSecret(d.clientSecret ?? "");
          }
        }
      )
      .catch(() => {})
      .finally(() => setConfigLoading(false));

    loadUnclaimed();
  }, []);

  const loadUnclaimed = () => {
    setUnclaimedLoading(true);
    fetch("/api/server/entra/unclaimed")
      .then((r) => r.json())
      .then((d: { users?: unknown[] }) =>
        setUnclaimedCount(d.users?.length ?? 0)
      )
      .catch(() => {})
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
      if (r.ok) flashConfig("saved");
      else flashConfig("error");
    } catch {
      flashConfig("error");
    } finally {
      setConfigSaving(false);
    }
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
      const d = (await r.json()) as {
        ok?: boolean;
        checks?: DiagnosticCheck[];
        groups?: EntraGroup[];
      };
      setDiagnostics(d.checks ?? []);
    } catch {
      setDiagnostics([
        {
          id: "network",
          label: "Reach API endpoint",
          status: "fail",
          detail: "Network error",
          hint: "Could not reach the server. Check your internet connection.",
        },
      ]);
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
      const d = groupsRes.value as {
        ok?: boolean;
        checks?: DiagnosticCheck[];
        groups?: EntraGroup[];
        error?: string;
      };
      if (d.ok) {
        setGroups(d.groups ?? []);
        // Persist diagnostic results so they're visible in the config card too
        if (d.checks) setDiagnostics(d.checks);
      } else {
        if (d.checks) setDiagnostics(d.checks);
        const failedCheck = d.checks?.find((c) => c.status === "fail");
        setGroupsError(
          failedCheck?.hint ??
            failedCheck?.detail ??
            d.error ??
            "Failed to connect to Entra"
        );
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
      const result = (await r.json()) as SyncResult;
      setSyncResult(result);
      setWizardStep("done");
      loadUnclaimed();
    } catch {
      setSyncResult({
        created: 0,
        skipped: 0,
        updated: 0,
        errors: ["Sync request failed"],
      });
      setWizardStep("done");
    }
  };

  const configured = tenantId && clientId && clientSecret;

  return (
    <>
      {/* Entra config card */}
      <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-foreground-500" />
          <h2 className="text-sm font-semibold text-foreground">
            Microsoft Entra ID
          </h2>
          <span className="text-xs text-foreground-400 ml-1">
            App registration credentials
          </span>
        </div>
        <form onSubmit={saveConfig} className="p-5 space-y-4">
          {configLoading ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <EntraSetupGuide />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Tenant ID"
                  id="entra-tenant"
                  value={tenantId}
                  onChange={setTenantId}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                <Field
                  label="Client ID"
                  id="entra-client"
                  value={clientId}
                  onChange={setClientId}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <Field
                label="Client Secret"
                id="entra-secret"
                value={clientSecret}
                onChange={setClientSecret}
                showToggle
                placeholder="Your app secret value"
              />
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
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground disabled:opacity-40 transition flex items-center gap-1.5"
                  >
                    {checking ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    Check connection
                  </button>
                )}
                {configured && diagnostics?.every((c) => c.status === "ok") && (
                  <button
                    type="button"
                    onClick={openWizard}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-indigo-500 text-foreground transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" /> Sync users…
                  </button>
                )}
                {configStatus === "saved" && (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Saved
                  </span>
                )}
                {configStatus === "error" && (
                  <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Save failed
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-neutral-200 bg-background-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Pending claims
                  </p>
                  <p className="text-xs text-foreground-500">
                    {unclaimedLoading
                      ? "Checking unclaimed users…"
                      : `${unclaimedCount} user${unclaimedCount === 1 ? "" : "s"} waiting to claim an account.`}
                  </p>
                </div>
                <Link
                  href="/users"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-background-100 border border-neutral-300 hover:border-indigo-500 text-foreground transition"
                >
                  <Users className="w-3 h-3" />
                  View users
                </Link>
              </div>

              {/* Diagnostic results */}
              {diagnostics && (
                <div className="rounded-lg border border-neutral-200 overflow-hidden mt-1">
                  {diagnostics.map((check, i) => (
                    <div
                      key={check.id}
                      className={cn(
                        "px-4 py-3 space-y-1",
                        i < diagnostics.length - 1 &&
                          "border-b border-neutral-200"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {check.status === "ok" ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "text-sm font-medium",
                            check.status === "ok"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400"
                          )}
                        >
                          {check.label}
                        </span>
                      </div>
                      {check.status === "fail" && check.hint && (
                        <p className="text-xs text-gray-600 dark:text-foreground-500 pl-6 leading-relaxed">
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
          <div className="bg-background-100 border border-neutral-300 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 shrink-0">
              <h2 className="text-foreground font-semibold">Sync Entra Users</h2>
              {wizardStep !== "syncing" && (
                <button
                  onClick={() => setWizardOpen(false)}
                  className="text-foreground-500 hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              {/* Step: groups */}
              {wizardStep === "groups" && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground-500">
                    Select which Entra groups to import. Leave everything
                    unselected to import all users in the tenant.
                  </p>
                  {groupsLoading && (
                    <div className="flex items-center gap-2 text-foreground-500 text-sm py-4">
                      <Loader2 className="w-4 h-4 animate-spin" /> Fetching
                      groups…
                    </div>
                  )}
                  {groupsError && (
                    <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      {groupsError}
                    </div>
                  )}
                  {!groupsLoading && !groupsError && (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {groups.map((g) => (
                        <label
                          key={g.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition",
                            selectedGroups.has(g.id)
                              ? "bg-indigo-100 dark:bg-indigo-600/15 border-indigo-300 dark:border-indigo-600/50"
                              : "bg-background-200 border-neutral-300 hover:border-foreground-500"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroups.has(g.id)}
                            onChange={() => toggleGroup(g.id)}
                            className="accent-indigo-500"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {g.displayName}
                            </p>
                            {g.description && (
                              <p className="text-xs text-foreground-400 truncate">
                                {g.description}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                      {groups.length === 0 && (
                        <p className="text-sm text-foreground-400 text-center py-6">
                          No groups found in this tenant.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step: realm-map */}
              {wizardStep === "realm-map" && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground-500">
                    Do you want to map Entra groups to VaultysClaw realms?
                    Synced users will be automatically added to the
                    corresponding realm.
                  </p>
                  <div className="flex gap-3">
                    {[
                      { v: false, label: "No, skip" },
                      { v: true, label: "Yes, map groups" },
                    ].map(({ v, label }) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setMapGroups(v)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl border text-sm font-medium transition",
                          mapGroups === v
                            ? "bg-indigo-50 dark:bg-indigo-600/20 border-indigo-300 dark:border-indigo-600/60 text-indigo-700 dark:text-indigo-300"
                            : "bg-background-200 border-neutral-300 text-foreground-500 hover:border-foreground-500"
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
                            <span
                              className="text-xs text-foreground-700 shrink-0 w-36 truncate"
                              title={g?.displayName ?? gid}
                            >
                              {g?.displayName ?? gid}
                            </span>
                            <ChevronRight className="w-3 h-3 text-foreground-400 shrink-0" />
                            <select
                              value={selected}
                              onChange={(e) =>
                                setRealmMap((m) => ({
                                  ...m,
                                  [gid]: e.target.value,
                                }))
                              }
                              className="flex-1 bg-background-200 border border-neutral-300 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">— no realm —</option>
                              <option value="__create__">
                                ✦ Create realm from group name
                              </option>
                              {realms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
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
                    <p className="text-xs text-foreground-400">
                      No groups selected — all users will be imported without
                      realm assignment.
                    </p>
                  )}
                </div>
              )}

              {/* Step: confirm */}
              {wizardStep === "confirm" && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground-500">
                    Ready to sync. Review your selection:
                  </p>
                  <div className="bg-background-200 border border-neutral-300 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-foreground-400">Groups</span>
                      <span className="text-foreground-700">
                        {selectedGroups.size === 0
                          ? "All tenant users"
                          : `${selectedGroups.size} group(s)`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-400">Realm mapping</span>
                      <span className="text-foreground-700">
                        {mapGroups ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    {mapGroups &&
                      Object.values(realmMap).some(
                        (v) => v === "__create__"
                      ) && (
                        <div className="pt-1 space-y-1 border-t border-neutral-200">
                          <p className="text-xs text-foreground-400 font-medium">
                            New realms to be created:
                          </p>
                          {Array.from(selectedGroups)
                            .filter((gid) => realmMap[gid] === "__create__")
                            .map((gid) => {
                              const g = groups.find((x) => x.id === gid);
                              return (
                                <div
                                  key={gid}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50 rounded px-1.5 py-0.5">
                                    {g?.displayName ?? gid}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    <div className="flex justify-between pt-1 border-t border-neutral-200">
                      <span className="text-foreground-400">Deduplication</span>
                      <span className="text-foreground-700">By email address</span>
                    </div>
                  </div>
                  <p className="text-xs text-foreground-400">
                    New users will be created as unclaimed accounts. They must
                    scan a QR code with their Vaultys wallet to activate their
                    account.
                  </p>
                </div>
              )}

              {/* Step: syncing */}
              {wizardStep === "syncing" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-8 h-8 text-indigo-700 dark:text-indigo-400 animate-spin" />
                  <p className="text-sm text-foreground-500">
                    Syncing users from Entra…
                  </p>
                </div>
              )}

              {/* Step: done */}
              {wizardStep === "done" && syncResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-foreground">
                      Sync complete
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        label: "Created",
                        value: syncResult.created,
                        color: "text-emerald-700 dark:text-emerald-400",
                      },
                      {
                        label: "Updated",
                        value: syncResult.updated,
                        color: "text-blue-700 dark:text-blue-400",
                      },
                      {
                        label: "Skipped",
                        value: syncResult.skipped,
                        color: "text-foreground-500",
                      },
                    ].map(({ label, value, color }) => (
                      <div
                        key={label}
                        className="bg-background-200 border border-neutral-300 rounded-lg p-3 text-center"
                      >
                        <p className={cn("text-2xl font-bold", color)}>
                          {value}
                        </p>
                        <p className="text-xs text-foreground-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {syncResult.errors.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-lg p-3 space-y-1 max-h-36 overflow-y-auto">
                      {syncResult.errors.map((e, i) => (
                        <p
                          key={i}
                          className="text-xs text-red-600 dark:text-red-300"
                        >
                          {e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer nav */}
            {wizardStep !== "syncing" && (
              <div className="flex justify-between gap-3 px-6 py-4 border-t border-neutral-200 shrink-0">
                <button
                  onClick={() => {
                    if (wizardStep === "done" || wizardStep === "groups") {
                      setWizardOpen(false);
                      return;
                    }
                    if (wizardStep === "realm-map") setWizardStep("groups");
                    if (wizardStep === "confirm") setWizardStep("realm-map");
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition"
                >
                  {wizardStep === "done" || wizardStep === "groups"
                    ? "Close"
                    : "Back"}
                </button>
                {wizardStep !== "done" && (
                  <button
                    onClick={() => {
                      if (wizardStep === "groups") {
                        setWizardStep("realm-map");
                        return;
                      }
                      if (wizardStep === "realm-map") {
                        setWizardStep("confirm");
                        return;
                      }
                      if (wizardStep === "confirm") doSync();
                    }}
                    disabled={groupsLoading || !!groupsError}
                    className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition flex items-center gap-2"
                  >
                    {wizardStep === "confirm" ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" /> Start sync
                      </>
                    ) : (
                      <>
                        Next <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    )}
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

// ─── API Keys Section ─────────────────────────────────────────────────────────

interface RouteGroup {
  group: string;
  routes: { path: string; methods: string[] }[];
}

function buildRouteGroups(): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const entry of ROUTE_REGISTRY) {
    if (entry.isPublic) continue;
    if (!map.has(entry.group))
      map.set(entry.group, { group: entry.group, routes: [] });
    map
      .get(entry.group)!
      .routes.push({ path: entry.path, methods: entry.methods });
  }
  return Array.from(map.values());
}

const ROUTE_GROUPS = buildRouteGroups();

function routeKey(method: string, path: string) {
  return `${method} ${path}`;
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [realms, setRealms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(ROUTE_GROUPS.map((g) => g.group))
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formRealmId, setFormRealmId] = useState<string>("");
  const [formIsRealmAdmin, setFormIsRealmAdmin] = useState(false);
  const [formExpiry, setFormExpiry] = useState("");
  const [formAllowed, setFormAllowed] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [keysRes, realmsRes] = await Promise.all([
        fetch("/api/api-keys"),
        fetch("/api/realms"),
      ]);
      const keysData = await keysRes.json();
      const realmsData = await realmsRes.json();
      setKeys(Array.isArray(keysData.apiKeys) ? keysData.apiKeys : []);
      setRealms(Array.isArray(realmsData.realms) ? realmsData.realms : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleRoute(method: string, path: string) {
    const k = routeKey(method, path);
    setFormAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleGroupColumn(group: string, isWrite: boolean) {
    const entries = ROUTE_GROUPS.find((g) => g.group === group)?.routes ?? [];
    const methods = isWrite
      ? entries.flatMap((r) =>
          r.methods.filter((m) => m !== "GET").map((m) => routeKey(m, r.path))
        )
      : entries.flatMap((r) =>
          r.methods.filter((m) => m === "GET").map((m) => routeKey(m, r.path))
        );
    const allSelected = methods.every((k) => formAllowed.has(k));
    setFormAllowed((prev) => {
      const next = new Set(prev);
      for (const k of methods) allSelected ? next.delete(k) : next.add(k);
      return next;
    });
  }

  function selectAll() {
    const all = ROUTE_GROUPS.flatMap((g) =>
      g.routes.flatMap((r) => r.methods.map((m) => routeKey(m, r.path)))
    );
    setFormAllowed(new Set(all));
  }

  function clearAll() {
    setFormAllowed(new Set());
  }

  function openModal() {
    setEditingKey(null);
    setFormName("");
    setFormRealmId("");
    setFormIsRealmAdmin(false);
    setFormExpiry("");
    setFormAllowed(new Set());
    setFormError(null);
    setShowModal(true);
  }

  function openEditModal(k: ApiKey) {
    setEditingKey(k);
    setFormName(k.name);
    setFormRealmId(k.realmId ?? "");
    setFormIsRealmAdmin(k.isRealmAdmin);
    setFormExpiry(
      k.expiresAt
        ? new Date(k.expiresAt * 1000).toISOString().split("T")[0]
        : ""
    );
    setFormAllowed(new Set(k.allowedRoutes));
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate() {
    if (!formName.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (formAllowed.size === 0) {
      setFormError("Select at least one route.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          allowedRoutes: Array.from(formAllowed),
          realmId: formRealmId || null,
          isRealmAdmin: formIsRealmAdmin,
          expiresAt: formExpiry
            ? Math.floor(new Date(formExpiry).getTime() / 1000)
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCreatedKey(data.key);
      setShowModal(false);
      fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setConfirmRevokeId(null);
    fetchData();
  }

  async function handleUpdate() {
    if (!editingKey) return;
    if (!formName.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (formAllowed.size === 0) {
      setFormError("Select at least one route.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/api-keys/${editingKey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          allowedRoutes: Array.from(formAllowed),
          realmId: formRealmId || null,
          isRealmAdmin: formIsRealmAdmin,
          expiresAt: formExpiry
            ? Math.floor(new Date(formExpiry).getTime() / 1000)
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setShowModal(false);
      setEditingKey(null);
      fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-foreground-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* One-time key banner */}
      {createdKey && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-green-800 dark:text-green-200 text-sm font-semibold mb-1">
                API key created — copy it now, it won&apos;t be shown again.
              </p>
              <code className="block bg-white dark:bg-black/30 rounded px-3 py-2 text-sm font-mono text-green-900 dark:text-green-100 break-all border border-green-200 dark:border-green-700">
                {createdKey}
              </code>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-medium hover:bg-green-800 transition"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={() => setCreatedKey(null)}
                className="p-1.5 rounded-lg text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800/40 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">API Keys</h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Authenticate external clients via{" "}
            <code className="bg-background-200 px-1 rounded">X-API-Key</code> header
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition"
        >
          <Plus className="w-4 h-4" /> New API Key
        </button>
      </div>

      {/* Table */}
      <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
        {keys.length === 0 ? (
          <div className="text-center py-12 text-foreground-500 text-sm">
            No API keys yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200">
              <tr className="text-left text-xs text-foreground-500 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Routes</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {keys.map((k) => {
                const realm = realms.find((r) => r.id === k.realmId);
                return (
                  <tr key={k.id} className="hover:bg-background-200/40 transition">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {k.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground-700 text-xs">
                      {k.keyPrefix}…
                    </td>
                    <td className="px-4 py-3 text-foreground-700">
                      {k.realmId ? (
                        <span className="flex items-center gap-1">
                          {realm?.name ?? k.realmId}
                          {k.isRealmAdmin && (
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 rounded">
                              admin
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-foreground-500">
                          <Globe className="w-3 h-3" /> Global
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground-700">
                      {k.allowedRoutes.length}
                    </td>
                    <td className="px-4 py-3 text-foreground-500 text-xs">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt * 1000).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-foreground-500 text-xs">
                      {k.expiresAt
                        ? new Date(k.expiresAt * 1000).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] font-medium",
                          k.isActive
                            ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                        )}
                      >
                        {k.isActive ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(k)}
                          title="Edit"
                          className="p-1.5 rounded text-foreground-500 hover:text-primary hover:bg-background-200 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {k.isActive &&
                          (confirmRevokeId === k.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleRevoke(k.id)}
                                className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmRevokeId(null)}
                                className="px-2 py-1 rounded text-xs text-foreground-500 hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRevokeId(k.id)}
                              className="p-1.5 rounded text-foreground-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background-100 rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h3 className="text-base font-semibold text-foreground">
                {editingKey ? "Edit API Key" : "New API Key"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. CI Pipeline, External Dashboard"
                  className="w-full px-3 py-2 rounded-lg bg-background-200 border border-neutral-300 text-sm text-foreground placeholder:text-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Realm scope */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Realm scope
                </label>
                <select
                  value={formRealmId}
                  onChange={(e) => setFormRealmId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background-200 border border-neutral-300 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Global — full admin access</option>
                  {realms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {formRealmId && (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsRealmAdmin}
                      onChange={(e) => setFormIsRealmAdmin(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-foreground">Realm admin</span>
                  </label>
                )}
              </div>

              {/* Expiry */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Expiry (optional)
                </label>
                <input
                  type="date"
                  value={formExpiry}
                  onChange={(e) => setFormExpiry(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-background-200 border border-neutral-300 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Route permissions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-foreground">
                    Allowed routes <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-primary hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearAll}
                      className="text-xs text-foreground-500 hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-300 overflow-hidden divide-y divide-neutral-300">
                  {ROUTE_GROUPS.map((group) => {
                    const isExpanded = expandedGroups.has(group.group);
                    const readRoutes = group.routes.flatMap((r) =>
                      r.methods
                        .filter((m) => m === "GET")
                        .map((m) => routeKey(m, r.path))
                    );
                    const writeRoutes = group.routes.flatMap((r) =>
                      r.methods
                        .filter((m) => m !== "GET")
                        .map((m) => routeKey(m, r.path))
                    );
                    const allRead =
                      readRoutes.length > 0 &&
                      readRoutes.every((k) => formAllowed.has(k));
                    const allWrite =
                      writeRoutes.length > 0 &&
                      writeRoutes.every((k) => formAllowed.has(k));
                    return (
                      <div key={group.group} className="bg-background-200">
                        {/* Group header */}
                        <div className="flex items-center px-3 py-2 gap-3">
                          <button
                            onClick={() => toggleGroup(group.group)}
                            className="flex items-center gap-1.5 flex-1 text-left text-xs font-semibold text-foreground hover:text-primary transition"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                            {group.group}
                          </button>
                          <div className="flex items-center gap-4 text-[11px] text-foreground-500">
                            {readRoutes.length > 0 && (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={allRead}
                                  onChange={() =>
                                    toggleGroupColumn(group.group, false)
                                  }
                                  className="rounded"
                                />
                                READ
                              </label>
                            )}
                            {writeRoutes.length > 0 && (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={allWrite}
                                  onChange={() =>
                                    toggleGroupColumn(group.group, true)
                                  }
                                  className="rounded"
                                />
                                WRITE
                              </label>
                            )}
                          </div>
                        </div>
                        {/* Route list */}
                        {isExpanded && (
                          <div className="divide-y divide-neutral-200/50 bg-background-100">
                            {group.routes.map((route) => {
                              const reads = route.methods.filter(
                                (m) => m === "GET"
                              );
                              const writes = route.methods.filter(
                                (m) => m !== "GET"
                              );
                              return (
                                <div
                                  key={route.path}
                                  className="flex items-center px-3 py-1.5 gap-3"
                                >
                                  <span className="flex-1 font-mono text-[11px] text-foreground-700 truncate">
                                    {route.path}
                                  </span>
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 flex justify-center">
                                      {reads.length > 0 && (
                                        <input
                                          type="checkbox"
                                          checked={reads.every((m) =>
                                            formAllowed.has(
                                              routeKey(m, route.path)
                                            )
                                          )}
                                          onChange={() =>
                                            reads.forEach((m) =>
                                              toggleRoute(m, route.path)
                                            )
                                          }
                                          className="rounded"
                                        />
                                      )}
                                    </div>
                                    <div className="w-12 flex justify-center">
                                      {writes.length > 0 && (
                                        <input
                                          type="checkbox"
                                          checked={writes.every((m) =>
                                            formAllowed.has(
                                              routeKey(m, route.path)
                                            )
                                          )}
                                          onChange={() =>
                                            writes.forEach((m) =>
                                              toggleRoute(m, route.path)
                                            )
                                          }
                                          className="rounded"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-foreground-500 mt-1.5">
                  {formAllowed.size} route(s) selected
                </p>
              </div>

              {formError && (
                <p className="text-red-500 text-xs bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-foreground-500 hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={editingKey ? handleUpdate : handleCreate}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editingKey ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                {editingKey ? "Save changes" : "Create Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "overview" | "settings" | "integrations" | "api-keys";

export default function ServerPage() {
  const { data: session } = useSession();
  const isAdmin =
    (session?.user as { isAdmin?: boolean; isOwner?: boolean } | undefined)
      ?.isAdmin ||
    (session?.user as { isOwner?: boolean } | undefined)?.isOwner;

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
          { id: "api-keys" as Tab, label: "API Keys", icon: Key },
        ]
      : []),
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-foreground-500 text-sm">Loading server info…</p>
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
      <div className="flex gap-1 bg-background-200 border border-neutral-300 rounded-xl p-1 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition",
              activeTab === id
                ? "bg-background-100 text-foreground shadow-sm"
                : "text-foreground-500 hover:text-foreground"
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
              <div className="bg-background-100 p-5 rounded-xl border border-neutral-200">
                <div className="text-foreground-500 text-xs uppercase tracking-wider mb-1">
                  Registered Agents
                </div>
                <div className="text-3xl font-bold text-foreground">
                  {data.stats.totalAgents}
                </div>
              </div>
              <div className="bg-background-100 p-5 rounded-xl border border-neutral-200">
                <div className="text-foreground-500 text-xs uppercase tracking-wider mb-1">
                  Online Now
                </div>
                <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                  {data.stats.onlineAgents}
                </div>
              </div>
              <div className="bg-background-100 p-5 rounded-xl border border-neutral-200">
                <div className="text-foreground-500 text-xs uppercase tracking-wider mb-1">
                  Offline
                </div>
                <div className="text-3xl font-bold text-gray-500">
                  {data.stats.offlineAgents}
                </div>
              </div>
            </div>
          )}

          <section className="bg-background-100 rounded-xl border border-neutral-200 p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              Server VaultysID
            </h2>
            {data?.identity ? (
              <pre className="bg-background-200 rounded p-4 text-sm font-mono text-foreground-700 overflow-x-auto">
                {JSON.stringify(data.identity, null, 2)}
              </pre>
            ) : (
              <p className="text-foreground-500 text-sm">
                Server identity not configured.
              </p>
            )}
          </section>

          {data?.sysInfo && (
            <section className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-foreground-500" />
                <h2 className="text-sm font-semibold text-foreground">
                  System Info
                </h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: "Hostname", value: data.sysInfo.hostname },
                  {
                    label: "Platform",
                    value: `${data.sysInfo.osType} ${data.sysInfo.osRelease}`,
                  },
                  { label: "Runtime", value: data.sysInfo.platform },
                  { label: "Uptime", value: formatUptime(data.sysInfo.uptime) },
                  { label: "Version", value: data.sysInfo.version },
                  { label: "Wallet URL", value: data.walletUrl },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-background-200 border border-neutral-300 rounded-lg p-4 min-w-0"
                  >
                    <div className="text-foreground-400 text-xs uppercase tracking-wider mb-1">
                      {label}
                    </div>
                    <div
                      className="text-sm font-medium text-foreground truncate"
                      title={String(value)}
                    >
                      {value}
                    </div>
                  </div>
                ))}
                <div className="bg-background-200 border border-neutral-300 rounded-lg p-4 min-w-0">
                  <div className="text-foreground-400 text-xs uppercase tracking-wider mb-1">
                    CPU
                  </div>
                  <div
                    className="text-sm font-medium text-foreground truncate"
                    title={data.sysInfo.cpuModel}
                  >
                    {data.sysInfo.cpuCount} cores · {data.sysInfo.cpuModel}
                  </div>
                </div>
                <div className="bg-background-200 border border-neutral-300 rounded-lg p-4 min-w-0">
                  <div className="text-foreground-400 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> Memory
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {formatBytes(data.sysInfo.totalMem - data.sysInfo.freeMem)}{" "}
                    / {formatBytes(data.sysInfo.totalMem)}
                  </div>
                </div>
                <div className="bg-background-200 border border-neutral-300 rounded-lg p-4 min-w-0">
                  <div className="text-foreground-400 text-xs uppercase tracking-wider mb-1">
                    Load Average
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {data.sysInfo.loadAvg
                      .map((load) => load.toFixed(2))
                      .join(" / ")}
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Settings tab (admin-only) ── */}
      {activeTab === "settings" && isAdmin && <ServerSettingsSection />}

      {/* ── Integrations tab (admin-only) ── */}
      {activeTab === "integrations" && isAdmin && (
        <div className="space-y-6">
          <EntraSection />
          <SmtpSection />
        </div>
      )}

      {/* ── API Keys tab (admin-only) ── */}
      {activeTab === "api-keys" && isAdmin && <ApiKeysSection />}
    </div>
  );
}
