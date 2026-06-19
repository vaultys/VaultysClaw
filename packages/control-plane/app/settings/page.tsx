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
  Plus,
  Trash2,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { ApiKey, ApiKeyCreatedResponse } from "@/lib/api/utils/api-types";
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

// ─── Route permissions editor ─────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RouteEntry {
  label: string;
  path: string;
  methods: HttpMethod[];
}

interface RouteGroup {
  name: string;
  routes: RouteEntry[];
}

const ROUTE_GROUPS: RouteGroup[] = [
  {
    name: "Agents",
    routes: [
      { label: "List / create agents", path: "/api/agents", methods: ["GET", "POST"] },
      { label: "Agent detail", path: "/api/agents/[did]", methods: ["GET", "PATCH", "DELETE"] },
      { label: "Run intent on agent", path: "/api/agents/[did]/run", methods: ["POST"] },
      { label: "Agent task queue", path: "/api/agents/[did]/task", methods: ["GET", "POST"] },
      { label: "Agent skills", path: "/api/agents/[did]/skills", methods: ["GET", "POST"] },
      { label: "Agent token usage", path: "/api/agents/[did]/token-usage", methods: ["GET"] },
      { label: "Agent schedules", path: "/api/agents/[did]/schedules", methods: ["GET", "POST"] },
    ],
  },
  {
    name: "Workflows",
    routes: [
      { label: "List / create workflows", path: "/api/workflows", methods: ["GET", "POST"] },
      { label: "Workflow detail", path: "/api/workflows/[id]", methods: ["GET", "PATCH", "DELETE"] },
      { label: "Execute workflow", path: "/api/workflows/[id]/execute", methods: ["POST"] },
      { label: "Workflow runs", path: "/api/workflow-runs", methods: ["GET"] },
      { label: "Workflow approvals", path: "/api/workflow-approvals", methods: ["GET", "POST"] },
    ],
  },
  {
    name: "Channels",
    routes: [
      { label: "List / create channels", path: "/api/channels", methods: ["GET", "POST"] },
      { label: "Channel detail", path: "/api/channels/[id]", methods: ["GET", "PATCH", "DELETE"] },
      { label: "Channel messages", path: "/api/channels/[id]/messages", methods: ["GET", "POST"] },
      { label: "Channel members", path: "/api/channels/[id]/members", methods: ["GET", "POST", "DELETE"] },
    ],
  },
  {
    name: "Intents",
    routes: [
      { label: "List intents", path: "/api/intents", methods: ["GET", "POST"] },
    ],
  },
  {
    name: "Governance",
    routes: [
      { label: "Governance summary", path: "/api/governance/summary", methods: ["GET"] },
      { label: "Audit log", path: "/api/governance/audit", methods: ["GET"] },
    ],
  },
  {
    name: "Users",
    routes: [
      { label: "List users", path: "/api/users", methods: ["GET"] },
      { label: "User detail", path: "/api/users/[did]", methods: ["GET", "PATCH", "DELETE"] },
      { label: "My profile", path: "/api/users/me", methods: ["GET", "PATCH"] },
    ],
  },
  {
    name: "Models & Knowledge",
    routes: [
      { label: "Models", path: "/api/models", methods: ["GET", "POST"] },
      { label: "Model detail", path: "/api/models/[id]", methods: ["GET", "PATCH", "DELETE"] },
      { label: "Knowledge bases", path: "/api/knowledge", methods: ["GET", "POST"] },
      { label: "Knowledge detail", path: "/api/knowledge/[id]", methods: ["GET", "PATCH", "DELETE"] },
    ],
  },
];

const FULL_ACCESS_ENTRIES: string[] = ["GET *", "POST *", "PATCH *", "DELETE *"];

function isFullAccess(routes: string[]) {
  return FULL_ACCESS_ENTRIES.every((e) => routes.includes(e)) && routes.every((r) => FULL_ACCESS_ENTRIES.includes(r));
}

function methodColor(m: HttpMethod) {
  return {
    GET: "bg-primary-100 border-primary-300 text-primary-700",
    POST: "bg-success-100 border-success-300 text-success-700",
    PATCH: "bg-warning-100 border-warning-300 text-warning-700",
    DELETE: "bg-danger-100 border-danger-300 text-danger-700",
  }[m];
}

function methodColorActive(m: HttpMethod) {
  return {
    GET: "bg-primary-600 text-white border-primary-600",
    POST: "bg-success-600 text-white border-success-600",
    PATCH: "bg-warning-600 text-white border-warning-600",
    DELETE: "bg-danger-600 text-white border-danger-600",
  }[m];
}

function RoutePermissionsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [customEntry, setCustomEntry] = useState("");
  const [customMethod, setCustomMethod] = useState<HttpMethod>("GET");

  const toggle = (entry: string) => {
    onChange(
      value.includes(entry) ? value.filter((e) => e !== entry) : [...value, entry]
    );
  };

  const toggleFullAccess = () => {
    if (isFullAccess(value)) {
      onChange([]);
    } else {
      onChange(FULL_ACCESS_ENTRIES);
    }
  };

  const addCustom = () => {
    const path = customEntry.trim();
    if (!path) return;
    const entry = `${customMethod} ${path.startsWith("/") ? path : "/" + path}`;
    if (!value.includes(entry)) onChange([...value, entry]);
    setCustomEntry("");
  };

  const removeCustom = (entry: string) => {
    onChange(value.filter((e) => e !== entry));
  };

  // Known entries from the groups
  const knownEntries = new Set(
    ROUTE_GROUPS.flatMap((g) => g.routes.flatMap((r) => r.methods.map((m) => `${m} ${r.path}`)))
  );
  const customEntries = value.filter((e) => !knownEntries.has(e) && !FULL_ACCESS_ENTRIES.includes(e));
  const full = isFullAccess(value);

  return (
    <div className="space-y-3">
      {/* Full access toggle */}
      <button
        type="button"
        onClick={toggleFullAccess}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition",
          full
            ? "bg-primary-100 border-primary-400 text-primary-700"
            : "bg-background-100 border-neutral-300 text-foreground-500 hover:border-foreground-400"
        )}
      >
        <span>Full access (all methods, all routes)</span>
        <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", full ? "bg-primary-600 border-primary-600" : "border-neutral-400")}>
          {full && <Check className="w-2.5 h-2.5 text-white" />}
        </span>
      </button>

      {!full && (
        <>
          {/* Grouped route checkboxes */}
          <div className="border border-neutral-300 rounded-lg overflow-hidden divide-y divide-neutral-200/60">
            {ROUTE_GROUPS.map((group) => (
              <div key={group.name}>
                <div className="px-3 py-1.5 bg-background-200/60 text-[10px] font-semibold uppercase tracking-wider text-foreground-400">
                  {group.name}
                </div>
                {group.routes.map((route) => (
                  <div key={route.path} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-background-200/30">
                    <div className="min-w-0">
                      <p className="text-xs text-foreground">{route.label}</p>
                      <p className="font-mono text-[10px] text-foreground-400 truncate">{route.path}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {route.methods.map((m) => {
                        const entry = `${m} ${route.path}`;
                        const active = value.includes(entry);
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => toggle(entry)}
                            className={cn(
                              "px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border transition",
                              active ? methodColorActive(m) : methodColor(m) + " opacity-40 hover:opacity-80"
                            )}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Custom entries */}
          {customEntries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customEntries.map((e) => (
                <span key={e} className="flex items-center gap-1 px-2 py-0.5 bg-background-200 border border-neutral-300 rounded-full text-[11px] font-mono text-foreground-600">
                  {e}
                  <button type="button" onClick={() => removeCustom(e)} className="text-foreground-400 hover:text-danger-600">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add custom route */}
          <div className="flex items-center gap-2">
            <select
              value={customMethod}
              onChange={(e) => setCustomMethod(e.target.value as HttpMethod)}
              className="bg-background-100 border border-neutral-300 rounded-lg px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            >
              {(["GET", "POST", "PATCH", "DELETE"] as HttpMethod[]).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="text"
              value={customEntry}
              onChange={(e) => setCustomEntry(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="/api/custom/[id]/action"
              className="flex-1 bg-background-100 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customEntry.trim()}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-400 text-foreground disabled:opacity-40 transition"
            >
              Add
            </button>
          </div>
          <p className="text-[10px] text-foreground-400">Click method badges to toggle access. Add custom routes for unlisted endpoints.</p>
        </>
      )}

      {/* Summary */}
      {value.length > 0 && (
        <p className="text-[11px] text-foreground-400">
          {full ? "Full access granted" : `${value.length} permission${value.length === 1 ? "" : "s"} selected`}
        </p>
      )}
    </div>
  );
}

// ─── API Keys section ─────────────────────────────────────────────────────────

interface KeyEditState {
  name: string;
  routes: string[];
  expiry: string;
  saving: boolean;
  error: string;
}

function KeyRow({
  k,
  onUpdate,
  onRevoke,
}: {
  k: ApiKey;
  onUpdate: (id: string, patch: Partial<ApiKey>) => void;
  onRevoke: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<KeyEditState>({
    name: k.name,
    routes: k.allowedRoutes,
    expiry: k.expiresAt ? new Date(k.expiresAt * 1000).toISOString().split("T")[0] : "",
    saving: false,
    error: "",
  });

  const openEdit = () => {
    setState({ name: k.name, routes: k.allowedRoutes, expiry: k.expiresAt ? new Date(k.expiresAt * 1000).toISOString().split("T")[0] : "", saving: false, error: "" });
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.name.trim()) { setState((s) => ({ ...s, error: "Name is required" })); return; }
    if (state.routes.length === 0) { setState((s) => ({ ...s, error: "At least one permission is required" })); return; }

    setState((s) => ({ ...s, saving: true, error: "" }));
    try {
      const res = await fetch(`/api/api-keys/${k.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name.trim(),
          allowedRoutes: state.routes,
          expiresAt: state.expiry ? Math.floor(new Date(state.expiry).getTime() / 1000) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setState((s) => ({ ...s, saving: false, error: err.error ?? "Save failed" }));
        return;
      }
      const updated = (await res.json()) as ApiKey;
      onUpdate(k.id, updated);
      setEditing(false);
    } catch {
      setState((s) => ({ ...s, saving: false, error: "Network error" }));
    }
  };

  if (editing) {
    return (
      <form onSubmit={save} className="px-5 py-4 bg-background-200/40 border-b border-neutral-200/60 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">Name</label>
            <input
              type="text"
              value={state.name}
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
              maxLength={128}
              autoFocus
              className="w-full bg-background-100 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">Expires</label>
            <input
              type="date"
              value={state.expiry}
              onChange={(e) => setState((s) => ({ ...s, expiry: e.target.value }))}
              className="w-full bg-background-100 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-2">Permissions</label>
          <RoutePermissionsEditor
            value={state.routes}
            onChange={(routes) => setState((s) => ({ ...s, routes }))}
          />
        </div>
        {state.error && <p className="text-xs text-danger-600">{state.error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={state.saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition">
            {state.saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center gap-1">
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3 group">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{k.name}</span>
          {!k.isActive && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-danger-100 text-danger-700 border border-danger-300 rounded-full">Revoked</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="font-mono text-[11px] text-foreground-400">{k.keyPrefix}…</span>
          <span className="text-[11px] text-foreground-400">
            {isFullAccess(k.allowedRoutes)
              ? "Full access"
              : `${k.allowedRoutes.length} permission${k.allowedRoutes.length === 1 ? "" : "s"}`}
          </span>
          {k.expiresAt && (
            <span className="flex items-center gap-0.5 text-[11px] text-foreground-400">
              <Clock className="w-3 h-3" />
              expires {new Date(k.expiresAt * 1000).toLocaleDateString()}
            </span>
          )}
          {k.lastUsedAt && (
            <span className="text-[11px] text-foreground-400">
              last used {new Date(k.lastUsedAt * 1000).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
        <button
          type="button"
          onClick={openEdit}
          title="Edit key"
          className="p-1.5 text-foreground-400 hover:text-foreground rounded-lg hover:bg-background-200 transition"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRevoke(k.id)}
          title="Revoke key"
          className="p-1.5 text-foreground-400 hover:text-danger-600 rounded-lg hover:bg-background-200 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formRoutes, setFormRoutes] = useState<string[]>([]);
  const [formExpiry, setFormExpiry] = useState("");
  const [formError, setFormError] = useState("");

  const load = () => {
    fetch("/api/api-keys")
      .then((r) => r.json())
      .then((d) => setKeys(d.apiKeys ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!formName.trim()) { setFormError("Name is required"); return; }
    if (formRoutes.length === 0) { setFormError("At least one permission is required"); return; }

    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          allowedRoutes: formRoutes,
          expiresAt: formExpiry ? Math.floor(new Date(formExpiry).getTime() / 1000) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setFormError(err.error ?? "Failed to create key");
        return;
      }
      const data = (await res.json()) as ApiKeyCreatedResponse;
      setNewKey(data.key);
      setFormName("");
      setFormRoutes([]);
      setFormExpiry("");
      setShowForm(false);
      load();
    } catch {
      setFormError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = (id: string, patch: Partial<ApiKey>) => {
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, ...patch } : k));
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  return (
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-foreground-500" />
          <h2 className="text-sm font-semibold text-foreground">API Keys</h2>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setFormError(""); setNewKey(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition"
        >
          <Plus className="w-3.5 h-3.5" /> New key
        </button>
      </div>

      {/* One-time key reveal */}
      {newKey && (
        <div className="mx-5 mt-4 p-3 bg-success-50 border border-success-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-success-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-success-700 mb-1">Key created — copy it now, it won't be shown again</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-success-800 bg-success-100 px-2 py-1 rounded break-all">{newKey}</code>
              <CopyButton value={newKey} />
            </div>
            <button type="button" onClick={() => setNewKey(null)} className="mt-1.5 text-[11px] text-success-600 hover:text-success-800 underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={create} className="mx-5 my-4 p-4 bg-background-200/60 border border-neutral-300 rounded-xl space-y-3">
          <p className="text-xs font-semibold text-foreground">New API Key</p>

          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. MCP Gateway"
              maxLength={128}
              className="w-full bg-background-100 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>

          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-2">Permissions</label>
            <RoutePermissionsEditor value={formRoutes} onChange={setFormRoutes} />
          </div>

          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">Expires (optional)</label>
            <input
              type="date"
              value={formExpiry}
              onChange={(e) => setFormExpiry(e.target.value)}
              className="bg-background-100 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>

          {formError && <p className="text-xs text-danger-600">{formError}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={creating}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition">
              {creating ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </form>
      )}

      {/* Key list */}
      {loading ? (
        <div className="px-5 py-6 space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-10 bg-background-200 rounded-lg animate-pulse" />)}
        </div>
      ) : keys.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-foreground-400">No API keys yet.</div>
      ) : (
        <div className="divide-y divide-neutral-200/60">
          {keys.map((k) => (
            <KeyRow key={k.id} k={k} onUpdate={handleUpdate} onRevoke={revoke} />
          ))}
        </div>
      )}

      <div className="px-5 py-3 border-t border-neutral-200/60">
        <p className="text-xs text-foreground-400">API keys grant programmatic access. Only global admins can manage keys. Each key is shown only once at creation.</p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "profile" | "security" | "api-keys" | "realms" | "appearance";

interface TabDef {
  id: Tab;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

export default function AccountPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [realms, setRealms] = useState<RealmMembership[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");

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

  const TABS: TabDef[] = [
    { id: "profile",    label: "Profile",     icon: User },
    { id: "security",   label: "Security",    icon: Shield },
    { id: "api-keys",   label: "API Keys",    icon: Key, adminOnly: true },
    { id: "realms",     label: "Realms",      icon: Globe2 },
    { id: "appearance", label: "Appearance",  icon: Sun },
  ];

  const visibleTabs = TABS.filter((t) => !t.adminOnly || profile?.isAdmin);

  if (profileLoading) {
    return (
      <div className="p-6 w-full max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-background-200 rounded-xl w-2/3" />
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-background-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-background-200/60 border border-neutral-200 rounded-xl p-1">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center",
              activeTab === id
                ? "bg-background-100 text-foreground shadow-sm border border-neutral-200"
                : "text-foreground-400 hover:text-foreground hover:bg-background-100/50"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab: Profile */}
      {activeTab === "profile" && (
        <div className="space-y-4">
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

          <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
            <SectionHeader icon={BadgeCheck} title="Roles" />
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
              <p className="text-xs text-foreground-400">Roles are assigned by administrators. Contact your admin to request changes.</p>
            </div>
          </section>
        </div>
      )}

      {/* Tab: Security */}
      {activeTab === "security" && (
        <div className="space-y-4">
          <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
            <SectionHeader icon={Shield} title="Identity" />
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
                      <span className="font-mono text-xs inline-block text-foreground-500">{profile.publicKey}</span>
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

          <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
            <SectionHeader icon={FileText} title="Session" />
            <div className="p-5 space-y-0">
              {profile?.id && (
                <Row label="Internal ID" value={<span className="flex items-center gap-0.5"><span className="font-mono text-xs text-foreground-500">{profile.id}</span><CopyButton value={profile.id} /></span>} />
              )}
              <Row label="Auth Method" value="VaultysID (Ed25519 ECDSA)" />
              <Row label="Session Protocol" value="NextAuth.js" />
            </div>
          </section>
        </div>
      )}

      {/* Tab: API Keys (admin only) */}
      {activeTab === "api-keys" && profile?.isAdmin && (
        <ApiKeysSection />
      )}

      {/* Tab: Realms */}
      {activeTab === "realms" && (
        <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
          <SectionHeader icon={Globe2} title="Realm Memberships" />
          {realms.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-foreground-400">
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
      )}

      {/* Tab: Appearance */}
      {activeTab === "appearance" && (
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
                      ? "bg-primary-100 border-primary-300 text-primary-700"
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
      )}

    </div>
  );
}
