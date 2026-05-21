"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Cpu, ArrowLeft, Globe2, CheckCircle2, XCircle, Pencil, Check, X,
  Trash2, Sparkles, Lock, Server, FlaskConical, RefreshCw, AlertCircle,
  Link2, Bot,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";

interface ModelDetail {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  modelId: string;
  baseUrl: string;
  hasApiKey: boolean;
  litellmModelName: string | null;
  status: "active" | "inactive";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  realms: { realmId: string; realmName: string; grantedAt: string }[];
}

interface RealmOption {
  id: string;
  name: string;
  color: string;
}

const TABS = [
  { id: "overview", label: "Overview", icon: Cpu },
  { id: "realms", label: "Realm Access", icon: Globe2 },
  { id: "deployment", label: "Deployment", icon: Server, comingSoon: true },
  { id: "training", label: "Fine-Tuning", icon: FlaskConical, comingSoon: true },
] as const;

type TabId = typeof TABS[number]["id"];

function ComingSoonOverlay({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-vc-bg/70 backdrop-blur-[2px] rounded-2xl">
        <Lock className="w-6 h-6 text-vc-muted" />
        <div className="text-center">
          <p className="text-sm font-semibold text-vc-text">{title}</p>
          <p className="text-xs text-vc-muted max-w-xs mt-1">{description}</p>
        </div>
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 uppercase tracking-wide">
          Coming soon
        </span>
      </div>
    </div>
  );
}

function OverviewTab({ model, onSaved, isAdmin }: {
  model: ModelDetail;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description ?? "");
  const [baseUrl, setBaseUrl] = useState(model.baseUrl);
  const [modelId, setModelId] = useState(model.modelId);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState(model.status);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<{ ok: boolean; models?: string[]; error?: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/models/${model.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, baseUrl, modelId, apiKey: apiKey || undefined, status }),
    });
    setSaving(false);
    if (res.ok) { setEditing(false); onSaved(); }
  }

  async function handleValidate() {
    setValidating(true);
    setValidateResult(null);
    const res = await fetch(`/api/models/${model.id}/validate`, { method: "POST" });
    const data = await res.json();
    setValidateResult(data);
    setValidating(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-vc-border bg-vc-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-vc-text">Endpoint Configuration</h3>
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs text-vc-muted hover:text-vc-text transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {editing && (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-vc-muted hover:text-vc-text">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-400 hover:text-indigo-300">
                <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {[
            { label: "Name", value: name, setter: setName, editable: true },
            { label: "Provider", value: model.provider, editable: false },
            { label: "Model ID", value: modelId, setter: setModelId, editable: true, mono: true },
            { label: "Base URL", value: baseUrl, setter: setBaseUrl, editable: true, mono: true },
          ].map(({ label, value, setter, editable, mono }) => (
            <div key={label}>
              <p className="text-xs text-vc-muted mb-1">{label}</p>
              {editing && editable && setter ? (
                <input
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-1.5 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className={`text-vc-text ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
              )}
            </div>
          ))}

          {editing && (
            <div>
              <p className="text-xs text-vc-muted mb-1">API Key <span className="text-vc-subtle">(leave blank to keep existing)</span></p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-1.5 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div>
            <p className="text-xs text-vc-muted mb-1">API Key</p>
            <p className="text-vc-text">{model.hasApiKey ? "••••••••" : <span className="text-vc-subtle italic">None</span>}</p>
          </div>

          <div>
            <p className="text-xs text-vc-muted mb-1">LiteLLM name</p>
            <code className="text-xs font-mono text-vc-muted">{model.litellmModelName ?? "—"}</code>
          </div>

          {editing && (
            <div>
              <p className="text-xs text-vc-muted mb-1">Status</p>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-1.5 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-vc-border bg-vc-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-vc-text">Connection Test</h3>
          <button
            onClick={handleValidate}
            disabled={validating}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-vc-raised hover:bg-vc-border border border-vc-border text-vc-text transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${validating ? "animate-spin" : ""}`} />
            {validating ? "Testing…" : "Test connection"}
          </button>
        </div>
        {validateResult === null ? (
          <p className="text-xs text-vc-muted">Click "Test connection" to verify the endpoint is reachable.</p>
        ) : validateResult.ok ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Endpoint reachable
            </div>
            {validateResult.models && validateResult.models.length > 0 && (
              <div>
                <p className="text-xs text-vc-muted mb-1">Available models:</p>
                <div className="flex flex-wrap gap-1">
                  {validateResult.models.map((m) => (
                    <code key={m} className="text-xs font-mono bg-vc-bg border border-vc-border rounded px-2 py-0.5 text-vc-muted">{m}</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
            <XCircle className="w-4 h-4" />
            {validateResult.error ?? "Endpoint unreachable"}
          </div>
        )}
      </div>
    </div>
  );
}

function RealmAccessTab({ model, onChanged }: { model: ModelDetail; onChanged: () => void }) {
  const [allRealms, setAllRealms] = useState<RealmOption[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const grantedIds = new Set(model.realms.map((r) => r.realmId));

  useEffect(() => {
    fetch("/api/realms").then((r) => r.json()).then((d: { realms?: RealmOption[] }) => setAllRealms(d.realms ?? []));
  }, []);

  async function toggle(realmId: string, hasAccess: boolean) {
    setToggling(realmId);
    if (hasAccess) {
      await fetch(`/api/models/${model.id}/realms?realmId=${realmId}`, { method: "DELETE" });
    } else {
      await fetch(`/api/models/${model.id}/realms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ realmId }),
      });
    }
    setToggling(null);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-vc-border bg-vc-surface p-5">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="w-4 h-4 text-vc-muted mt-0.5 shrink-0" />
          <p className="text-xs text-vc-muted">
            Realms with access can route agents to this model via their LiteLLM virtual key.
            Agents in those realms receive updated config automatically.
          </p>
        </div>
        <div className="space-y-2">
          {allRealms.map((realm) => {
            const hasAccess = grantedIds.has(realm.id);
            const loading = toggling === realm.id;
            return (
              <div key={realm.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-vc-raised/40 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: realm.color }} />
                  <span className="text-sm text-vc-text">{realm.name}</span>
                </div>
                <button
                  onClick={() => toggle(realm.id, hasAccess)}
                  disabled={loading}
                  className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-vc-surface ${hasAccess ? "bg-indigo-600" : "bg-vc-raised border border-vc-border"}`}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${hasAccess ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            );
          })}
          {allRealms.length === 0 && <p className="text-xs text-vc-muted py-2">No realms found.</p>}
        </div>
      </div>

      {/* Coming soon: budget & routing rules */}
      <ComingSoonOverlay
        title="Fallback & Routing Rules"
        description="Configure fallback chains and routing strategy. Maps to LiteLLM's fallback config — if this model is unavailable, requests route to the configured fallback automatically."
      >
        <div className="rounded-2xl border border-vc-border bg-vc-surface p-5 space-y-3">
          <h3 className="text-sm font-semibold text-vc-text">Routing Rules</h3>
          <div className="space-y-2">
            {["Fallback 1 — gpt-4o (OpenAI)", "Fallback 2 — claude-3-5-sonnet (Anthropic)"].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl bg-vc-raised/40 text-sm text-vc-muted">
                <span>{item}</span>
                <Link2 className="w-3.5 h-3.5" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-vc-muted">
            <span>Strategy:</span>
            <span className="px-2 py-0.5 rounded bg-vc-raised border border-vc-border">Latency-based</span>
          </div>
        </div>
      </ComingSoonOverlay>
    </div>
  );
}

function DeploymentTab() {
  return (
    <ComingSoonOverlay
      title="Kubernetes Deployment"
      description="Connect a Kubernetes cluster in Settings to auto-provision vLLM GPU pods. Karpenter provisions GPU nodes on demand and scales to zero when idle."
    >
      <div className="rounded-2xl border border-vc-border bg-vc-surface p-5 space-y-4">
        <h3 className="text-sm font-semibold text-vc-text">Deploy to Kubernetes</h3>
        <div className="grid grid-cols-2 gap-3">
          {[["Instance type", "g5.xlarge (A10G 24GB)"], ["Replicas", "1"], ["Scale to zero", "After 15 min idle"], ["Namespace", "vaultys-models"]].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-vc-muted mb-1">{label}</p>
              <div className="h-8 bg-vc-bg border border-vc-border rounded-lg px-3 flex items-center text-sm text-vc-muted">{val}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-600/30 border border-indigo-300 dark:border-indigo-800 flex items-center justify-center text-sm text-indigo-400 dark:text-indigo-300 font-medium">
            Deploy to Kubernetes
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-vc-muted pt-1">
          <span className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> vLLM pod</span>
          <span>→</span>
          <span className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> LiteLLM registered</span>
          <span>→</span>
          <span className="flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Agents updated</span>
        </div>
      </div>
    </ComingSoonOverlay>
  );
}

function TrainingTab() {
  return (
    <ComingSoonOverlay
      title="Fine-Tuning Pipeline"
      description="Run Unsloth training jobs as Kubernetes Jobs. Upload your dataset, pick a base model, and track progress — no GPU server to manage."
    >
      <div className="rounded-2xl border border-vc-border bg-vc-surface p-5 space-y-4">
        <h3 className="text-sm font-semibold text-vc-text">Start Fine-Tuning</h3>
        <div className="grid grid-cols-2 gap-3">
          {[["Base model", "meta-llama/Llama-3.1-8B"], ["Method", "LoRA (recommended)"], ["Epochs", "3"], ["Instance", "g5.2xlarge"]].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-vc-muted mb-1">{label}</p>
              <div className="h-8 bg-vc-bg border border-vc-border rounded-lg px-3 flex items-center text-sm text-vc-muted">{val}</div>
            </div>
          ))}
        </div>
        <div className="h-24 bg-vc-bg border border-vc-border border-dashed rounded-xl flex items-center justify-center text-xs text-vc-muted">
          Drop JSONL training data here
        </div>
        <div className="flex items-center justify-between text-xs text-vc-muted bg-vc-bg border border-vc-border rounded-xl px-4 py-2.5">
          <span>Estimated cost: ~$4.20 on g5.2xlarge</span>
          <span>Est. time: ~45 min</span>
        </div>
        <div className="h-9 rounded-xl bg-indigo-100 dark:bg-indigo-600/30 border border-indigo-300 dark:border-indigo-800 flex items-center justify-center text-sm text-indigo-400 dark:text-indigo-300 font-medium">
          Start Fine-Tuning
        </div>
      </div>
    </ComingSoonOverlay>
  );
}

export default function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isGlobalAdmin } = useRole();
  const [model, setModel] = useState<ModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("overview");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/models/${id}`);
    if (res.ok) {
      const data = await res.json() as { model: ModelDetail };
      setModel(data.model);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!confirm(`Delete model "${model?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    router.push("/models");
  }

  if (loading) return <div className="p-6 text-sm text-vc-muted">Loading…</div>;
  if (!model) return <div className="p-6 text-sm text-vc-muted">Model not found.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/models")} className="text-vc-muted hover:text-vc-text transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-vc-text truncate">{model.name}</h1>
            {model.description && <p className="text-xs text-vc-muted truncate">{model.description}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {model.status === "active" ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-500 text-xs font-medium">
                <XCircle className="w-3.5 h-3.5" /> Inactive
              </span>
            )}
            {isGlobalAdmin && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-lg text-vc-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-vc-border gap-1">
        {TABS.map((tab_) => {
          const { id: tabId, label, icon: Icon } = tab_; const comingSoon = "comingSoon" in tab_ && tab_.comingSoon; return (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === tabId
                  ? "border-indigo-500 text-indigo-700 dark:text-indigo-400"
                  : "border-transparent text-vc-muted hover:text-vc-text"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {comingSoon && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-500 border border-amber-300 dark:border-amber-800 uppercase tracking-wide leading-none">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab model={model} onSaved={load} isAdmin={isGlobalAdmin} />}
      {tab === "realms" && <RealmAccessTab model={model} onChanged={load} />}
      {tab === "deployment" && <DeploymentTab />}
      {tab === "training" && <TrainingTab />}
    </div>
  );
}
