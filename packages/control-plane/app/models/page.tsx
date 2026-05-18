"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Plus, Globe2, CheckCircle2, XCircle, Lock, Sparkles } from "lucide-react";
import { useRole } from "@/hooks/useRole";

interface ModelEntry {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  modelId: string;
  baseUrl: string;
  litellmModelName: string | null;
  status: "active" | "inactive";
  createdAt: string;
  realmCount: number;
}

const PROVIDERS = [
  { value: "openai-compatible", label: "OpenAI-compatible / vLLM" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "ollama", label: "Ollama" },
];

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    openai: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
    "openai-compatible": "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800",
    anthropic: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
    google: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800",
    ollama: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors[provider] ?? "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-gray-300 dark:border-zinc-700"}`}>
      {provider}
    </span>
  );
}

function RegisterModelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("openai-compatible");
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    if (!modelId.trim()) { setError("Model ID is required"); return; }
    if (!baseUrl.trim()) { setError("Base URL is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, provider, modelId, baseUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to register model"); setSaving(false); return; }
      onCreated();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-base font-semibold text-vc-text mb-4">Register Model</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-vc-muted mb-1">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Customer Support LLaMA"
            />
          </div>
          <div>
            <label className="block text-sm text-vc-muted mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-vc-muted mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-vc-muted mb-1">Model ID</label>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. meta-llama/Llama-3-8B-Instruct"
            />
            <p className="text-xs text-vc-subtle mt-1">The exact model name served by the endpoint</p>
          </div>
          <div>
            <label className="block text-sm text-vc-muted mb-1">Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="http://vllm-service:8000"
            />
          </div>
          <div>
            <label className="block text-sm text-vc-muted mb-1">API Key <span className="text-vc-subtle">(optional)</span></label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-vc-bg border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Leave empty if not required"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-vc-border text-sm text-vc-muted hover:text-vc-text hover:bg-vc-raised transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? "Registering…" : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ModelsPage() {
  const router = useRouter();
  const { isGlobalAdmin } = useRole();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/models");
      const data = await res.json() as { models?: ModelEntry[] };
      setModels(data.models ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-vc-text">Model Registry</h1>
            <p className="text-xs text-vc-muted">Register and route models to realms</p>
          </div>
        </div>
        {isGlobalAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Register model
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-vc-muted py-8 text-center">Loading…</div>
      ) : models.length === 0 ? (
        <div className="rounded-2xl border border-vc-border border-dashed bg-vc-surface/40 p-12 text-center">
          <Cpu className="w-8 h-8 text-vc-subtle mx-auto mb-3" />
          <p className="text-sm font-medium text-vc-text mb-1">No models registered</p>
          <p className="text-xs text-vc-muted mb-4">Register an OpenAI-compatible endpoint to get started</p>
          {isGlobalAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Register first model
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-vc-border bg-vc-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vc-border text-vc-muted text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Provider</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Model ID</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Realms</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => router.push(`/models/${m.id}`)}
                  className="border-b border-vc-border/50 hover:bg-vc-raised/40 cursor-pointer transition-colors last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-vc-text">{m.name}</div>
                    {m.description && <div className="text-xs text-vc-muted truncate max-w-[180px]">{m.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <ProviderBadge provider={m.provider} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <code className="text-xs text-vc-muted font-mono truncate max-w-[180px] block">{m.modelId}</code>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="flex items-center gap-1 text-vc-muted">
                      <Globe2 className="w-3.5 h-3.5" />
                      {m.realmCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.status === "active" ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-zinc-500 text-xs font-medium">
                        <XCircle className="w-3.5 h-3.5" /> Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Coming soon cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-vc-border border-dashed bg-vc-surface/40 p-5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-zinc-400" />
              </div>
              <span className="text-sm font-medium text-vc-text">Kubernetes Deployment</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 uppercase tracking-wide">Coming soon</span>
          </div>
          <p className="text-xs text-vc-muted">Auto-provision vLLM GPU pods directly from the control plane. One-click deploy with Karpenter auto-scaling and scale-to-zero.</p>
        </div>

        <div className="rounded-2xl border border-vc-border border-dashed bg-vc-surface/40 p-5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Lock className="w-4 h-4 text-zinc-400" />
              </div>
              <span className="text-sm font-medium text-vc-text">Fine-Tuning Pipeline</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 uppercase tracking-wide">Coming soon</span>
          </div>
          <p className="text-xs text-vc-muted">Submit Unsloth training jobs from the UI. Upload JSONL datasets, pick a base model, and track job progress — no GPU server management required.</p>
        </div>
      </div>

      {showCreate && (
        <RegisterModelModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  );
}
