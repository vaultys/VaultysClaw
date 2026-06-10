"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Cpu, RefreshCw, CheckCircle2, XCircle, X } from "lucide-react";

const PROVIDERS = [
  {
    value: "openai-compatible",
    label: "OpenAI-compatible / vLLM",
    defaults: { baseUrl: "http://localhost:8000", modelId: "meta-llama/Llama-3-8B-Instruct" },
  },
  {
    value: "openai",
    label: "OpenAI",
    defaults: { baseUrl: "https://api.openai.com/v1", modelId: "gpt-4o-mini" },
  },
  {
    value: "anthropic",
    label: "Anthropic",
    defaults: { baseUrl: "https://api.anthropic.com", modelId: "claude-opus-4-7" },
  },
  {
    value: "google",
    label: "Google",
    defaults: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", modelId: "gemini-2.0-flash" },
  },
  {
    value: "ollama",
    label: "Ollama",
    defaults: { baseUrl: "http://localhost:11434", modelId: "llama2" },
  },
];

interface ExistingModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  status: "active" | "inactive";
}

interface RegisterModelFormProps {
  /** Called after a model is successfully registered */
  onAdded?: (name: string) => void;
  /** Called when the user is done (for modal/inline cancel) */
  onClose?: () => void;
  /** Whether to show the description field */
  showDescription?: boolean;
  /** Whether to load and show already-registered models above the form */
  showExistingModels?: boolean;
  /** Layout: "grid" (2-col) or "stack" (1-col) */
  layout?: "grid" | "stack";
}

export function RegisterModelForm({
  onAdded,
  onClose,
  showDescription = false,
  showExistingModels = false,
  layout = "grid",
}: RegisterModelFormProps) {
  // Existing models list
  const [existingModels, setExistingModels] = useState<ExistingModel[]>([]);
  const [existingLoading, setExistingLoading] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; error?: string } | "testing">
  >({});

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("openai-compatible");
  const [modelId, setModelId] = useState(PROVIDERS[0].defaults.modelId);
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].defaults.baseUrl);
  const [apiKey, setApiKey] = useState("");
  // Form state
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelList, setShowModelList] = useState(false);

  const loadExisting = useCallback(async () => {
    if (!showExistingModels) return;
    setExistingLoading(true);
    try {
      const res = await fetch("/api/models");
      const data = (await res.json()) as { models?: ExistingModel[] };
      setExistingModels(data.models ?? []);
    } finally {
      setExistingLoading(false);
    }
  }, [showExistingModels]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const p = PROVIDERS.find((p) => p.value === newProvider);
    if (p) {
      setBaseUrl(p.defaults.baseUrl);
      setModelId(p.defaults.modelId);
    }
    setAvailableModels([]);
    setShowModelList(false);
    setFormMsg(null);
  };

  const testConnection = async () => {
    if (!baseUrl.trim()) {
      setFormMsg({ ok: false, text: "Base URL is required" });
      return;
    }
    setTesting(true);
    setFormMsg(null);
    setAvailableModels([]);
    setShowModelList(false);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, modelId, baseUrl, apiKey: apiKey || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; models?: string[] };
      if (data.ok) {
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          setShowModelList(true);
          setFormMsg({ ok: true, text: `Connection successful — ${data.models.length} model${data.models.length !== 1 ? "s" : ""} found` });
        } else {
          setFormMsg({ ok: true, text: "Connection successful" });
          setTimeout(() => setFormMsg(null), 2500);
        }
      } else {
        setFormMsg({ ok: false, text: data.error ?? "Connection failed" });
      }
    } catch {
      setFormMsg({ ok: false, text: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setFormMsg({ ok: false, text: "Name is required" }); return; }
    if (!modelId.trim()) { setFormMsg({ ok: false, text: "Model ID is required" }); return; }
    if (!baseUrl.trim()) { setFormMsg({ ok: false, text: "Base URL is required" }); return; }

    setSaving(true);
    setFormMsg(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          provider,
          modelId: modelId.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormMsg({ ok: false, text: data.error ?? "Failed to register model" });
        return;
      }
      const registeredName = name.trim();
      onAdded?.(registeredName);
      setName("");
      setDescription("");
      setApiKey("");
      setAvailableModels([]);
      setShowModelList(false);
      setFormMsg({ ok: true, text: `"${registeredName}" registered` });
      setTimeout(() => setFormMsg(null), 2500);
      await loadExisting();
    } catch {
      setFormMsg({ ok: false, text: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const testExisting = async (id: string) => {
    setTestResults((r) => ({ ...r, [id]: "testing" }));
    try {
      const res = await fetch(`/api/models/${id}/validate`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setTestResults((r) => ({ ...r, [id]: data }));
    } catch {
      setTestResults((r) => ({ ...r, [id]: { ok: false, error: "Network error" } }));
    }
  };

  const deleteExisting = async (id: string) => {
    if (!confirm("Remove this model?")) return;
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    await loadExisting();
  };

  const inputCls =
    "w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* Existing models list */}
      {showExistingModels && (
        <div className="space-y-2">
          {existingLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : existingModels.length > 0 ? (
            existingModels.map((m) => {
              const result = testResults[m.id];
              const isTesting = result === "testing";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3 bg-background-200 border border-neutral-200 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                    <code className="text-xs text-foreground-500 font-mono truncate block">{m.modelId}</code>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                    m.provider === "openai" ? "bg-success-100 text-success-700 border-success-300"
                    : m.provider === "openai-compatible" ? "bg-primary-100 text-primary-700 border-primary-300"
                    : m.provider === "anthropic" ? "bg-warning-100 text-warning-700 border-warning-300"
                    : m.provider === "google" ? "bg-warning-100 text-warning-700 border-warning-300"
                    : "bg-secondary-100 text-secondary-700 border-secondary-300"
                  }`}>
                    {m.provider}
                  </span>
                  {result !== undefined && result !== "testing" && (
                    result.ok
                      ? <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0" />
                      : <XCircle className="w-4 h-4 text-danger-500 shrink-0" />
                  )}
                  <button
                    onClick={() => testExisting(m.id)}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-100 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {isTesting
                      ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      : <RefreshCw className="w-3 h-3" />}
                    Test
                  </button>
                  <button
                    onClick={() => deleteExisting(m.id)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 text-danger-500/60 hover:text-danger-600 hover:bg-danger-500/5 hover:border-danger-500/30 transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-neutral-200 border-dashed bg-background-200/40 py-5 text-center">
              <Cpu className="w-6 h-6 text-foreground-400 mx-auto mb-1" />
              <p className="text-sm text-foreground-500">No models registered yet</p>
            </div>
          )}
        </div>
      )}

      {/* Registration form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className={`grid ${layout === "grid" ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
          {/* Name */}
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">Name *</label>
            <input
              autoFocus={!showExistingModels || existingModels.length === 0}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GPT-4o"
              className={inputCls}
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className={inputCls}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">Base URL *</label>
            <input
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setAvailableModels([]); setShowModelList(false); }}
              placeholder="https://api.openai.com/v1"
              className={inputCls}
            />
          </div>

          {/* Model ID */}
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">Model ID *</label>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="gpt-4o-mini"
              className={inputCls}
            />
          </div>

          {/* API Key */}
          <div className={layout === "grid" ? "col-span-2" : ""}>
            <label className="block text-xs text-foreground-500 mb-1.5">
              API Key <span className="text-foreground-400">(optional)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className={inputCls}
            />
          </div>

          {/* Description */}
          {showDescription && (
            <div className={layout === "grid" ? "col-span-2" : ""}>
              <label className="block text-xs text-foreground-500 mb-1.5">
                Description <span className="text-foreground-400">(optional)</span>
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className={inputCls}
              />
            </div>
          )}
        </div>

        {/* Available models from test */}
        {showModelList && availableModels.length > 0 && (
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">
              Available models — click to select
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {availableModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setModelId(m); setShowModelList(false); }}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors truncate ${
                    modelId === m
                      ? "bg-primary-50 border-primary-400 text-primary-800"
                      : "bg-background-100 border-neutral-200 hover:border-primary-400/50 hover:bg-primary-500/5"
                  }`}
                  title={m}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status message */}
        {formMsg && (
          <p className={`text-xs px-3 py-2 rounded-xl border ${
            formMsg.ok
              ? "bg-success-50 border-success-300 text-success-700"
              : "bg-danger-50 border-danger-300 text-danger-600"
          }`}>
            {formMsg.ok && <Check className="w-3 h-3 inline mr-1" />}
            {formMsg.text}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={testConnection}
            disabled={testing || !baseUrl.trim() || !modelId.trim()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-xl disabled:opacity-40 transition-colors"
          >
            {testing
              ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            {testing ? "Testing…" : "Test"}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Cpu className="w-4 h-4" />}
            {saving ? "Registering…" : "Register"}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto text-sm text-foreground-500 hover:text-foreground transition-colors"
            >
              {showExistingModels && existingModels.length > 0 ? "Done" : "Cancel"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
