"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Globe2, ArrowLeft, Bot, Users, Settings, Trash2,
  ChevronRight, Star, Plus, X, Pencil, Check, Network, GitFork, LayoutTemplate,
  Puzzle, Lock, AlertCircle, Cpu, ExternalLink
} from "lucide-react";
import Link from "next/link";
import { useWorkflowStore } from "@/components/workflow/store";
import { TemplateSelectionModal } from "@/components/workflow/TemplateSelectionModal";
import EmbeddedOrgChart from "@/components/graph/EmbeddedOrgChart";

interface Realm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_default: number;
  llm_config: string | null;
  default_capabilities: string;
  created_at: string;
  tokenUsage?: { promptTokens: number; completionTokens: number } | null;
}

interface RealmAgent {
  agent_did: string;
  agent_name: string;
  capabilities: string;
  is_primary: number;
  joined_at: string;
}

interface RealmUser {
  user_did: string;
  name: string | null;
  email: string | null;
  is_primary: number;
  joined_at: string;
}

interface RealmWorkflow {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RealmSkill {
  id: string;
  realmId: string;
  name: string;
  description: string | null;
  version: string | null;
  isRequired: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

interface FullAgent { id: string; name: string; realms: { id: string }[] }
interface FullUser { did: string; name: string | null; email: string | null }

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#06b6d4",
];

function shortDid(did: string) {
  return did.length > 24 ? `${did.slice(0, 12)}…${did.slice(-6)}` : did;
}

function initials(name: string | null, fallback: string) {
  if (name) return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return fallback.slice(-2).toUpperCase();
}

// ---- Add member modal ----
function AddMemberModal({
  realm,
  type,
  onClose,
  onAdded,
}: {
  realm: Realm;
  type: "agent" | "user";
  onClose: () => void;
  onAdded: () => void;
}) {
  const [items, setItems] = useState<(FullAgent | FullUser)[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (type === "agent") {
      fetch("/api/agents").then((r) => r.json()).then((d) => setItems(d.agents ?? []));
    } else {
      fetch("/api/users").then((r) => r.json()).then((d) => setItems(d.users ?? []));
    }
  }, [type]);

  // Filter out already-members (agents already have realm array)
  const available = type === "agent"
    ? (items as FullAgent[]).filter((a) => !a.realms?.some((r) => r.id === realm.id))
    : items as FullUser[];

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    setError("");
    const url = `/api/realms/${realm.id}/${type === "agent" ? "agents" : "users"}`;
    const body = type === "agent"
      ? { agentDid: selected, isPrimary }
      : { userDid: selected, isPrimary };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed");
      setSaving(false);
      return;
    }
    onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-vc-text mb-4">
          Add {type === "agent" ? "Agent" : "User"}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-vc-muted mb-1">Select {type}</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— choose —</option>
              {available.map((item) => {
                const id = type === "agent" ? (item as FullAgent).id : (item as FullUser).did;
                const label = type === "agent"
                  ? (item as FullAgent).name
                  : ((item as FullUser).name ?? shortDid((item as FullUser).did));
                return <option key={id} value={id}>{label}</option>;
              })}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-vc-muted cursor-pointer select-none">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)}
              className="accent-indigo-600" />
            Set as primary realm for this {type}
          </label>
          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-vc-border text-vc-muted text-sm hover:text-vc-text transition-colors">
              Cancel
            </button>
            <button onClick={handleAdd} disabled={!selected || saving}
              className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main page ----
export default function RealmDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [realm, setRealm] = useState<Realm | null>(null);
  const [agents, setAgents] = useState<RealmAgent[]>([]);
  const [users, setUsers] = useState<RealmUser[]>([]);
  const [workflows, setWorkflows] = useState<RealmWorkflow[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{ promptTokens: number; completionTokens: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"agents" | "users" | "workflows" | "config" | "org-chart" | "skills" | "models">("agents");
  const [realmModels, setRealmModels] = useState<{ id: string; name: string; provider: string; modelId: string; litellmModelName: string | null; status: string }[]>([]);
  const [routerKey, setRouterKey] = useState<{ hasVirtualKey: boolean; allowedModels: string[]; monthlyBudgetUsd: number | null } | null>(null);
  const [skills, setSkills] = useState<RealmSkill[]>([]);
  const [addModal, setAddModal] = useState<"agent" | "user" | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const setWorkflowStore = useWorkflowStore((s) => s.setWorkflow);
  const clearWorkflowStore = useWorkflowStore((s) => s.clearWorkflow);

  // Inline edit
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [realmRes, skillsRes, modelsRes] = await Promise.all([
      fetch(`/api/realms/${id}`),
      fetch(`/api/realms/${id}/skills`),
      fetch(`/api/realms/${id}/models`),
    ]);
    if (realmRes.status === 404) { router.replace("/realms"); return; }
    const data = await realmRes.json() as { realm: Realm; agents: RealmAgent[]; users: RealmUser[]; workflows: RealmWorkflow[]; tokenUsage?: { promptTokens: number; completionTokens: number } | null };
    setRealm(data.realm);
    setAgents(data.agents);
    setUsers(data.users);
    setWorkflows(data.workflows ?? []);
    setTokenUsage(data.tokenUsage ?? null);
    if (skillsRes.ok) {
      const skillsData = await skillsRes.json() as { skills: RealmSkill[] };
      setSkills(skillsData.skills ?? []);
    }
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json() as { models: typeof realmModels; routerKey: typeof routerKey };
      setRealmModels(modelsData.models ?? []);
      setRouterKey(modelsData.routerKey);
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function handleSelectTemplate(templateId: string) {
    try {
      const res = await fetch(`/api/workflows/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = (await res.json()) as { template: { definition: any; name: string } };
      clearWorkflowStore();
      setWorkflowStore("", data.template.name, "", data.template.definition);
      router.push(`/workflows/new?fromTemplate=1&realm=${id}`);
    } catch (err) {
      console.error("Failed to load template:", err);
      alert("Failed to load template");
    }
  }

  function startEdit() {
    if (!realm) return;
    setEditName(realm.name);
    setEditDesc(realm.description ?? "");
    setEditColor(realm.color);
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    await fetch(`/api/realms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc, color: editColor }),
    });
    setSaving(false);
    setEditing(false);
    load();
  }

  async function handleRemoveAgent(did: string) {
    if (!confirm("Remove agent from this realm?")) return;
    await fetch(`/api/realms/${id}/agents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentDid: did }),
    });
    load();
  }

  async function handleRemoveUser(did: string) {
    if (!confirm("Remove user from this realm?")) return;
    await fetch(`/api/realms/${id}/users`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userDid: did }),
    });
    load();
  }

  async function handleSetDefault() {
    await fetch(`/api/realms/${id}/default`, { method: "POST" });
    load();
  }

  async function handleDelete() {
    if (!confirm("Delete this realm? This cannot be undone.")) return;
    await fetch(`/api/realms/${id}`, { method: "DELETE" });
    router.push("/realms");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!realm) return null;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Back */}
      <Link href="/realms" className="inline-flex items-center gap-1.5 text-vc-muted hover:text-vc-text text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Realms
      </Link>

      {/* Header card */}
      <div className="bg-vc-surface border border-vc-border rounded-2xl overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: realm.color }} />
        <div className="p-5 flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: realm.color + "22", border: `1px solid ${realm.color}44` }}
          >
            <Globe2 className="w-6 h-6" style={{ color: realm.color }} />
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-vc-bg border border-vc-border rounded-lg px-3 py-1.5 text-sm text-vc-text w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="bg-vc-bg border border-vc-border rounded-lg px-3 py-1.5 text-sm text-vc-text w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Description"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: editColor === c ? "white" : "transparent",
                        boxShadow: editColor === c ? `0 0 0 2px ${c}` : "none",
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />{saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-vc-border text-vc-muted hover:text-vc-text text-xs transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-semibold text-vc-text">{realm.name}</h1>
                  {realm.is_default === 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                      default
                    </span>
                  )}
                  <code className="text-xs text-vc-subtle font-mono bg-vc-raised px-1.5 py-0.5 rounded">{realm.slug}</code>
                </div>
                {realm.description && (
                  <p className="text-vc-muted text-sm mt-1">{realm.description}</p>
                )}
                <p className="text-vc-subtle text-xs mt-1.5">
                  {agents.length} agent{agents.length !== 1 ? "s" : ""} · {users.length} user{users.length !== 1 ? "s" : ""} · {workflows.length} workflow{workflows.length !== 1 ? "s" : ""}
                  · Created {new Date(realm.created_at).toLocaleDateString()}
                </p>
              </>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/realms/${id}/graph`}
                className="p-2 rounded-lg text-vc-muted hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors"
                title="View relationship graph"
              >
                <Network className="w-4 h-4" />
              </Link>
              <button
                onClick={startEdit}
                className="p-2 rounded-lg text-vc-muted hover:text-vc-text hover:bg-vc-raised transition-colors"
                title="Edit realm"
              >
                <Pencil className="w-4 h-4" />
              </button>
              {realm.is_default !== 1 && (
                <button
                  onClick={handleSetDefault}
                  className="p-2 rounded-lg text-vc-muted hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                  title="Set as default realm"
                >
                  <Star className="w-4 h-4" />
                </button>
              )}
              {realm.is_default !== 1 && (
                <button
                  onClick={handleDelete}
                  className="p-2 rounded-lg text-vc-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Delete realm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Token metrics — always shown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-vc-surface border border-vc-border rounded-2xl p-5">
          <p className="text-xs text-vc-subtle mb-2">Input Tokens</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{(tokenUsage?.promptTokens ?? 0).toLocaleString()}</p>
        </div>
        <div className="bg-vc-surface border border-vc-border rounded-2xl p-5">
          <p className="text-xs text-vc-subtle mb-2">Output Tokens</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{(tokenUsage?.completionTokens ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-vc-border">
        {(["agents", "users", "workflows", "skills", "models", "org-chart", "config"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t
              ? "border-indigo-500 text-indigo-700 dark:text-indigo-400"
              : "border-transparent text-vc-muted hover:text-vc-text"
              }`}
          >
            {t === "agents" && `Agents (${agents.length})`}
            {t === "users" && `Users (${users.length})`}
            {t === "workflows" && `Workflows (${workflows.length})`}
            {t === "skills" && `Skills (${skills.length})`}
            {t === "models" && `Models (${realmModels.length})`}
            {t === "org-chart" && "Org Chart"}
            {t === "config" && "Config"}
          </button>
        ))}
      </div>

      {/* Agents tab */}
      {tab === "agents" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setAddModal("agent")}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Agent
            </button>
          </div>
          {agents.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Bot className="w-8 h-8 text-vc-ring mb-2" />
              <p className="text-vc-muted text-sm">No agents in this realm.</p>
            </div>
          ) : (
            <div className="bg-vc-surface border border-vc-border rounded-2xl overflow-hidden">
              {agents.map((a, i) => (
                <div key={a.agent_did}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-vc-border/50" : ""}`}>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-vc-text truncate">{a.agent_name}</span>
                      {a.is_primary === 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">primary</span>
                      )}
                    </div>
                    <code className="text-xs text-vc-subtle font-mono">{shortDid(a.agent_did)}</code>
                  </div>
                  <Link
                    href={`/agents/${a.agent_did}`}
                    className="p-1.5 rounded-lg text-vc-muted hover:text-indigo-400 transition-colors"
                    title="View agent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  {realm.is_default !== 1 && (
                    <button
                      onClick={() => handleRemoveAgent(a.agent_did)}
                      className="p-1.5 rounded-lg text-vc-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title="Remove from realm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setAddModal("user")}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
          {users.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Users className="w-8 h-8 text-vc-ring mb-2" />
              <p className="text-vc-muted text-sm">No users in this realm.</p>
            </div>
          ) : (
            <div className="bg-vc-surface border border-vc-border rounded-2xl overflow-hidden">
              {users.map((u, i) => (
                <div key={u.user_did}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-vc-border/50" : ""}`}>
                  <div className="w-8 h-8 rounded-full bg-vc-raised border border-vc-border flex items-center justify-center shrink-0 text-xs font-semibold text-vc-muted">
                    {initials(u.name, u.user_did)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-vc-text truncate">{u.name ?? shortDid(u.user_did)}</span>
                      {u.is_primary === 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">primary</span>
                      )}
                    </div>
                    {u.email && <p className="text-xs text-vc-subtle truncate">{u.email}</p>}
                  </div>
                  {realm.is_default !== 1 && (
                    <button
                      onClick={() => handleRemoveUser(u.user_did)}
                      className="p-1.5 rounded-lg text-vc-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title="Remove from realm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skills tab */}
      {tab === "skills" && (
        <RealmSkillsTab realmId={id} skills={skills} onChanged={load} />
      )}

      {/* Models tab */}
      {tab === "models" && (
        <div className="space-y-4">
          {/* Router key status */}
          <div className="bg-vc-surface border border-vc-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-vc-text flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-700 dark:text-indigo-400" /> LiteLLM Router Key
              </h3>
              {routerKey?.hasVirtualKey ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-medium">Active</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 border border-gray-300 dark:border-zinc-700 font-medium">Not configured</span>
              )}
            </div>
            <p className="text-xs text-vc-muted">
              {routerKey?.hasVirtualKey
                ? `Agents in this realm share a virtual key scoped to ${routerKey.allowedModels.length} model${routerKey.allowedModels.length !== 1 ? "s" : ""}. The key is auto-updated when model access changes.`
                : "No virtual key yet. Grant access to at least one model to generate a scoped routing key."}
            </p>
          </div>

          {/* Model access list */}
          {realmModels.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Cpu className="w-8 h-8 text-vc-ring mb-2" />
              <p className="text-vc-muted text-sm">No models accessible to this realm.</p>
              <p className="text-vc-subtle text-xs mt-1 mb-3">Grant access from the Model Registry to route agents here.</p>
              <a href="/models" className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-400 hover:text-indigo-300 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Go to Model Registry
              </a>
            </div>
          ) : (
            <div className="bg-vc-surface border border-vc-border rounded-2xl overflow-hidden">
              {realmModels.map((m, i) => (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-vc-border/50" : ""}`}>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-vc-text">{m.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-vc-raised text-vc-muted border border-vc-border">{m.provider}</span>
                    </div>
                    <code className="text-xs text-vc-subtle font-mono truncate block">{m.modelId}</code>
                  </div>
                  <a href={`/models/${m.id}`} className="p-1.5 rounded-lg text-vc-muted hover:text-vc-text transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* Coming soon: budget & rate limits */}
          <div className="relative">
            <div className="opacity-40 pointer-events-none select-none">
              <div className="bg-vc-surface border border-vc-border rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-vc-text">Budget &amp; Rate Limits</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[["Monthly spend cap", "$500 / month"], ["RPM limit", "100 req/min"], ["Alert at", "80% of budget"]].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs text-vc-muted mb-1">{label}</p>
                      <div className="h-8 bg-vc-bg border border-vc-border rounded-lg px-3 flex items-center text-sm text-vc-muted">{val}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-vc-subtle">Enforced by LiteLLM virtual keys — requests rejected once the cap is reached.</p>
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-vc-bg/70 backdrop-blur-[2px] rounded-2xl">
              <Lock className="w-5 h-5 text-vc-muted" />
              <p className="text-sm font-semibold text-vc-text">Budget &amp; Rate Limits</p>
              <p className="text-xs text-vc-muted text-center max-w-xs">Per-realm spend caps and RPM limits — enforced automatically by LiteLLM virtual keys.</p>
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 uppercase tracking-wide">Coming soon</span>
            </div>
          </div>
        </div>
      )}

      {/* Config tab */}
      {tab === "config" && (
        <RealmConfigTab realm={realm} onSaved={load} />
      )}

      {/* Workflows tab */}
      {tab === "workflows" && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
            >
              <LayoutTemplate className="w-4 h-4" /> From Template
            </button>
            <Link
              href={`/workflows/new?realm=${id}`}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> New Workflow
            </Link>
          </div>
          {workflows.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <GitFork className="w-8 h-8 text-vc-ring mb-2" />
              <p className="text-vc-muted text-sm">No workflows in this realm.</p>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => setShowTemplateModal(true)}
                  className="text-violet-400 hover:text-violet-300 text-sm underline"
                >
                  Start from template
                </button>
                <span className="text-vc-subtle text-sm">or</span>
                <Link
                  href={`/workflows/new?realm=${id}`}
                  className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-300 text-sm underline"
                >
                  Create blank workflow
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-vc-surface border border-vc-border rounded-2xl overflow-hidden">
              {workflows.map((wf, i) => (
                <div key={wf.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-vc-border/50" : ""}`}>
                  <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center shrink-0">
                    <GitFork className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-vc-text truncate block">{wf.name}</span>
                    {wf.description && (
                      <p className="text-xs text-vc-muted truncate">{wf.description}</p>
                    )}
                    <p className="text-xs text-vc-subtle">Updated {new Date(wf.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <Link
                    href={`/workflows/${wf.id}`}
                    className="p-1.5 rounded-lg text-vc-muted hover:text-indigo-400 transition-colors"
                    title="Open workflow editor"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Org Chart tab */}
      {tab === "org-chart" && (
        <div className="space-y-3">
          <EmbeddedOrgChart query={`?realm=${id}`} height={600} showFullscreenBtn={true} />
        </div>
      )}

      {/* Modals */}
      {addModal && (
        <AddMemberModal
          realm={realm}
          type={addModal}
          onClose={() => setAddModal(null)}
          onAdded={load}
        />
      )}
      {showTemplateModal && (
        <TemplateSelectionModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          onSelectTemplate={handleSelectTemplate}
        />
      )}
    </div>
  );
}

// ---- Realm skills tab ----

function RealmSkillsTab({
  realmId,
  skills,
  onChanged,
}: {
  realmId: string;
  skills: RealmSkill[];
  onChanged: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addVersion, setAddVersion] = useState("");
  const [addRequired, setAddRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    if (!addName.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/realms/${realmId}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addName.trim(),
        description: addDesc.trim() || undefined,
        version: addVersion.trim() || undefined,
        isRequired: addRequired,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to add skill");
      setSaving(false);
      return;
    }
    setAddName(""); setAddDesc(""); setAddVersion(""); setAddRequired(false);
    setShowAdd(false);
    setSaving(false);
    onChanged();
  }

  async function handleToggleRequired(skill: RealmSkill) {
    await fetch(`/api/realms/${realmId}/skills/${skill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRequired: !skill.isRequired }),
    });
    onChanged();
  }

  async function handleDelete(skill: RealmSkill) {
    if (!confirm(`Remove skill "${skill.name}" from this realm?`)) return;
    await fetch(`/api/realms/${realmId}/skills/${skill.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-vc-muted">
          Skills listed here are pushed to agents in this realm. Required skills cannot be disabled by agents.
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> Add Skill
        </button>
      </div>

      {showAdd && (
        <div className="bg-vc-surface border border-vc-border rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-vc-text">Add Skill</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-vc-muted mb-1">Skill name *</label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. web-scraper"
                className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-vc-muted mb-1">Version</label>
              <input
                value={addVersion}
                onChange={(e) => setAddVersion(e.target.value)}
                placeholder="e.g. 1.0.0"
                className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-vc-muted mb-1">Description</label>
            <input
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              placeholder="What does this skill do?"
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-vc-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addRequired}
              onChange={(e) => setAddRequired(e.target.checked)}
              className="accent-indigo-600"
            />
            <Lock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            Required — agents cannot disable this skill
          </label>
          {error && <p className="text-red-600 dark:text-red-400 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!addName.trim() || saving}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Adding…" : "Add Skill"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(""); }}
              className="px-4 py-2 rounded-xl border border-vc-border text-vc-muted hover:text-vc-text text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {skills.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Puzzle className="w-8 h-8 text-vc-ring mb-2" />
          <p className="text-vc-muted text-sm">No skills configured for this realm.</p>
          <p className="text-vc-subtle text-xs mt-1">
            Add skills to control which agent capabilities are available in this realm.
          </p>
        </div>
      ) : (
        skills.length > 0 && (
          <div className="bg-vc-surface border border-vc-border rounded-2xl overflow-hidden">
            {skills.map((skill, i) => (
              <div
                key={skill.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-vc-border/50" : ""}`}
              >
                <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center shrink-0">
                  <Puzzle className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-vc-text font-mono">{skill.name}</span>
                    {skill.version && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-vc-raised text-vc-subtle font-mono">v{skill.version}</span>
                    )}
                    {skill.isRequired ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> required
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-vc-raised text-vc-subtle">optional</span>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-xs text-vc-muted truncate mt-0.5">{skill.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleRequired(skill)}
                  className={`p-1.5 rounded-lg transition-colors text-xs ${skill.isRequired
                    ? "text-amber-400 hover:text-vc-muted hover:bg-vc-raised"
                    : "text-vc-muted hover:text-amber-400 hover:bg-amber-400/10"
                  }`}
                  title={skill.isRequired ? "Make optional" : "Make required"}
                >
                  <Lock className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(skill)}
                  className="p-1.5 rounded-lg text-vc-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Remove skill"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ---- Realm config tab (LLM override + default capabilities) ----

const ALL_CAPS = [
  "file_access", "internet_access", "browser_control",
  "api_call", "mail_send", "code_execution", "system_command", "llm_query",
];

function RealmConfigTab({ realm, onSaved }: { realm: Realm; onSaved: () => void }) {
  const defaultCaps: string[] = JSON.parse(realm.default_capabilities || "[]");
  const [caps, setCaps] = useState<string[]>(defaultCaps);
  const [saving, setSaving] = useState(false);

  function toggle(cap: string) {
    setCaps((prev) => prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/realms/${realm.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultCapabilities: caps }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-vc-surface border border-vc-border rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-vc-text mb-1">Default Capabilities</h3>
          <p className="text-xs text-vc-muted mb-3">
            Capabilities suggested to admins when approving agents into this realm.
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_CAPS.map((cap) => (
              <button
                key={cap}
                onClick={() => toggle(cap)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${caps.includes(cap)
                  ? "bg-indigo-50 dark:bg-indigo-600/20 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300"
                  : "bg-vc-raised border-vc-border text-vc-muted hover:text-vc-text"
                  }`}
              >
                {cap.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? "Saving…" : "Save Config"}
          </button>
        </div>
      </div>
    </div>
  );
}
