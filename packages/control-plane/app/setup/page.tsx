"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Cpu, Mail, Users, Bot, Check, X, ChevronRight, Shield,
  Plus, RefreshCw, CheckCircle2, XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { RegisterModelModal } from "@/components/models/RegisterModelModal";

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const LS_DONE  = "vaultysclaw:wizardDone";
const LS_STATE = "vaultysclaw:wizardState";

type StepId = "model" | "email" | "users" | "agent";

interface WizardState { step: number; completed: StepId[] }

function loadWizardState(): WizardState {
  try {
    const raw = typeof window !== "undefined" && localStorage.getItem(LS_STATE);
    if (raw) return JSON.parse(raw) as WizardState;
  } catch { /* ignore */ }
  return { step: 0, completed: [] };
}

function saveWizardState(s: WizardState) {
  localStorage.setItem(LS_STATE, JSON.stringify(s));
}

// ─── Step progress bar ───────────────────────────────────────────────────────

function StepProgress({
  currentIdx,
  completedSteps,
}: {
  currentIdx: number;
  completedSteps: Set<StepId>;
}) {
  return (
    <div className="flex items-start mb-8">
      {STEPS.map(({ id, label, icon: Icon }, idx) => {
        const isActive    = idx === currentIdx;
        const isPast      = idx < currentIdx;
        const isCompleted = completedSteps.has(id);
        return (
          <React.Fragment key={id}>
            <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
              <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                isActive
                  ? "border-indigo-500 bg-indigo-500 text-white shadow-md shadow-indigo-500/30"
                  : isPast && isCompleted
                  ? "border-green-500 bg-green-500 text-white"
                  : isPast
                  ? "border-vc-border bg-vc-raised text-vc-muted"
                  : "border-vc-border bg-vc-surface text-vc-subtle"
              }`}>
                {isPast && isCompleted
                  ? <Check className="w-4 h-4" />
                  : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-[11px] font-medium whitespace-nowrap ${
                isActive
                  ? "text-indigo-500 dark:text-indigo-400"
                  : isPast && isCompleted
                  ? "text-green-600 dark:text-green-400"
                  : isPast
                  ? "text-vc-muted"
                  : "text-vc-subtle"
              }`}>
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mt-[18px] mx-1 transition-colors duration-500 ${
                idx < currentIdx && completedSteps.has(STEPS[idx].id)
                  ? "bg-green-400 dark:bg-green-500"
                  : idx < currentIdx
                  ? "bg-vc-border"
                  : "bg-vc-raised"
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step registry ────────────────────────────────────────────────────────────

const STEPS: { id: StepId; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "model",  label: "LLM Model", desc: "Connect an AI model",        icon: Cpu   },
  { id: "email",  label: "Email",     desc: "Configure SMTP",             icon: Mail  },
  { id: "users",  label: "Users",     desc: "Invite teammates",           icon: Users },
  { id: "agent",  label: "Agents",    desc: "Register your first agent",  icon: Bot   },
];
const STEP_IDS = STEPS.map((s) => s.id);

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-xs text-vc-muted mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full bg-vc-raised border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
      />
    </div>
  );
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2 mt-1 border-t border-vc-border">
      {children}
    </div>
  );
}

// ─── Step 1 — LLM Model ───────────────────────────────────────────────────────

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  status: "active" | "inactive";
}

const PROVIDERS = [
  { value: "openai-compatible", label: "OpenAI-compatible / vLLM", defaults: { baseUrl: "http://localhost:8000", modelId: "meta-llama/Llama-3-8B-Instruct" } },
  { value: "openai",            label: "OpenAI",                   defaults: { baseUrl: "https://api.openai.com/v1", modelId: "gpt-4o-mini" } },
  { value: "anthropic",         label: "Anthropic",                defaults: { baseUrl: "https://api.anthropic.com", modelId: "claude-opus-4-7" } },
  { value: "google",            label: "Google",                   defaults: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", modelId: "gemini-2.0-flash" } },
  { value: "ollama",            label: "Ollama",                   defaults: { baseUrl: "http://localhost:11434", modelId: "llama2" } },
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
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${colors[provider] ?? "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-gray-300 dark:border-zinc-700"}`}>
      {provider}
    </span>
  );
}

function ModelStep({ onNext }: { onNext: () => void }) {
  const [models,       setModels]       = useState<ModelEntry[]>([]);
  const [fetching,     setFetching]     = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [testResults,  setTestResults]  = useState<Record<string, { ok: boolean; error?: string } | "testing">>({});

  // Form state for new model
  const [showForm,     setShowForm]     = useState(false);
  const [name,         setName]         = useState("");
  const [provider,     setProvider]     = useState("openai-compatible");
  const [modelId,      setModelId]      = useState("");
  const [baseUrl,      setBaseUrl]      = useState("");
  const [apiKey,       setApiKey]       = useState("");
  const [saving,       setSaving]       = useState(false);
  const [testingNew,   setTestingNew]   = useState(false);
  const [formError,    setFormError]    = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelList, setShowModelList] = useState(false);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json() as { models?: ModelEntry[] };
      setModels(data.models ?? []);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const providerConfig = PROVIDERS.find(p => p.value === newProvider);
    if (providerConfig) {
      setBaseUrl(providerConfig.defaults.baseUrl);
      setModelId(providerConfig.defaults.modelId);
    }
  };

  const testModel = async (id: string) => {
    setTestResults((r) => ({ ...r, [id]: "testing" }));
    try {
      const res = await fetch(`/api/models/${id}/validate`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      setTestResults((r) => ({ ...r, [id]: data }));
    } catch {
      setTestResults((r) => ({ ...r, [id]: { ok: false, error: "Network error" } }));
    }
  };

  const deleteModel = async (id: string) => {
    if (!confirm("Remove this model?")) return;
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadModels();
      }
    } catch (err) {
      console.error("Failed to delete model:", err);
    }
  };

  const testNewModel = async () => {
    if (!baseUrl.trim()) {
      setFormError("Base URL is required");
      return;
    }
    setTestingNew(true);
    setFormError("");
    setAvailableModels([]);
    setShowModelList(false);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, modelId, baseUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; models?: string[] };
      if (data.ok) {
        setFormError("✓ Connection successful!");
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          setShowModelList(true);
        }
        setTimeout(() => {
          if (data.models?.length === 0) setFormError("");
        }, 2000);
      } else {
        setFormError(data.error ?? "Connection failed");
      }
    } catch {
      setFormError("Network error");
    } finally {
      setTestingNew(false);
    }
  };

  const saveNewModel = async () => {
    if (!name.trim()) { setFormError("Name is required"); return; }
    if (!modelId.trim()) { setFormError("Model ID is required"); return; }
    if (!baseUrl.trim()) { setFormError("Base URL is required"); return; }

    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, provider, modelId, baseUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setFormError(data.error ?? "Failed to register model"); setSaving(false); return; }

      setName("");
      setModelId("");
      setBaseUrl("");
      setApiKey("");
      setShowForm(false);
      await loadModels();
    } catch {
      setFormError("Network error");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Connect an LLM so your agents can reason and act. You can register more models later from the Models page.
      </p>

      {fetching ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {models.length > 0 && (
            <div className="space-y-2">
              {models.map((m) => {
                const result    = testResults[m.id];
                const isTesting = result === "testing";
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-vc-raised border border-vc-border rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-vc-text truncate">{m.name}</p>
                      <code className="text-xs text-vc-muted font-mono truncate block">{m.modelId}</code>
                    </div>
                    <ProviderBadge provider={m.provider} />
                    {result !== undefined && result !== "testing" && (
                      result.ok
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        : <XCircle      className="w-4 h-4 text-red-500 shrink-0"   />
                    )}
                    <button
                      onClick={() => testModel(m.id)}
                      disabled={isTesting}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-surface transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isTesting
                        ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        : <RefreshCw className="w-3 h-3" />}
                      Test
                    </button>
                    <button
                      onClick={() => deleteModel(m.id)}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-vc-border text-red-500/60 hover:text-red-600 hover:bg-red-500/5 hover:border-red-500/30 transition-colors shrink-0"
                      title="Remove model"
                    >
                      <X className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {showForm && (
            <div className="bg-vc-raised border border-vc-border rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs text-vc-muted mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-vc-surface border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="e.g. Production LLaMA"
                />
              </div>
              <div>
                <label className="block text-xs text-vc-muted mb-1.5">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full bg-vc-surface border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-vc-muted mb-1.5">Base URL</label>
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full bg-vc-surface border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="http://localhost:8000"
                  />
                </div>
                <div>
                  <label className="block text-xs text-vc-muted mb-1.5">Model ID</label>
                  <input
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="w-full bg-vc-surface border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="gpt-4o-mini"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-vc-muted mb-1.5">API Key {provider !== "ollama" && <span className="text-vc-subtle">(optional)</span>}</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-vc-surface border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="sk-..."
                />
              </div>
              {formError && (
                <p className={`text-xs px-3 py-2 rounded-lg border ${
                  formError.startsWith("✓")
                    ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/40 text-green-700 dark:text-green-400"
                    : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/40 text-red-600 dark:text-red-400"
                }`}>
                  {formError}
                </p>
              )}

              {showModelList && availableModels.length > 0 && (
                <div>
                  <label className="block text-xs text-vc-muted mb-2">Available Models</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {availableModels.map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => {
                          setModelId(model);
                          setShowModelList(false);
                        }}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg bg-vc-surface border border-vc-border hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors truncate"
                        title={model}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={testNewModel}
                  disabled={testingNew || !baseUrl.trim() || !modelId.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-surface rounded-lg disabled:opacity-50 transition-colors"
                >
                  {testingNew
                    ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    : <RefreshCw className="w-3 h-3" />}
                  Test Connection
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError(""); }}
                  className="flex-1 px-3 py-2 text-xs border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-surface rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNewModel}
                  disabled={saving}
                  className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Register"}
                </button>
              </div>
            </div>
          )}

          {!showForm && models.length === 0 && (
            <div className="rounded-xl border border-vc-border border-dashed bg-vc-raised/40 py-6 text-center space-y-1">
              <Cpu className="w-6 h-6 text-vc-subtle mx-auto" />
              <p className="text-sm text-vc-muted">No models registered yet</p>
            </div>
          )}
        </>
      )}

      <StepFooter>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              handleProviderChange(provider);
            }}
            className="flex items-center gap-2 px-4 py-2 border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Add model
          </button>
        )}
        {models.length > 0 && (
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Continue →
          </button>
        )}
      </StepFooter>
    </div>
  );
}

// ─── Step 2 — Email / SMTP ────────────────────────────────────────────────────

function EmailStep({ onNext }: { onNext: () => void }) {
  const [host,     setHost]     = useState("");
  const [port,     setPort]     = useState("587");
  const [user,     setUser]     = useState("");
  const [password, setPassword] = useState("");
  const [from,     setFrom]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "fail"; text: string } | null>(null);

  const flash = (type: "ok" | "fail", text: string) => {
    setMsg({ type, text });
    if (type === "ok") setTimeout(onNext, 1200);
    else setTimeout(() => setMsg(null), 3000);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) {
      flash("fail", "SMTP host is required");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: +port, secure: +port === 465, user, password, from }),
      });
      if (r.ok) flash("ok", "SMTP saved — advancing…"); else flash("fail", "Save failed");
    } catch { flash("fail", "Network error"); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: +port, secure: +port === 465, user, password, from }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) flash("ok", "Connection successful"); else flash("fail", d.error ?? "Test failed");
    } catch { flash("fail", "Test failed"); }
    finally { setTesting(false); }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Configure SMTP so VaultysClaw can send QR invite emails to new users.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="SMTP Host"     value={host}     onChange={(e) => setHost(e.target.value)}     placeholder="smtp.example.com" />
        <Field label="Port"          value={port}     onChange={(e) => setPort(e.target.value)}     placeholder="587" />
        <Field label="Username"      value={user}     onChange={(e) => setUser(e.target.value)}     placeholder="user@example.com" />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <div className="col-span-2">
          <Field label="From address" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="noreply@example.com" />
        </div>
      </div>

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-xl border ${
          msg.type === "ok"
            ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/40 text-green-700 dark:text-green-400"
            : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/40 text-red-600 dark:text-red-400"
        }`}>
          {msg.text}
        </p>
      )}

      <StepFooter>
        <button
          type="button" onClick={test} disabled={testing || !host}
          className="flex items-center gap-1.5 px-4 py-2 text-sm border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised rounded-xl disabled:opacity-40 transition-colors"
        >
          {testing
            ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
            : <Mail className="w-3.5 h-3.5" />}
          Test
        </button>
        <button
          type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
        >
          {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          Save & Continue
        </button>
      </StepFooter>
    </form>
  );
}

// ─── Step 3 — Users ───────────────────────────────────────────────────────────

function UsersStep({ onNext }: { onNext: () => void }) {
  const [tab,        setTab]        = useState<"qr" | "email" | "entra">("qr");
  const [phase,      setPhase]      = useState<"idle" | "loading" | "qr" | "success" | "failure">("idle");
  const [qrUrl,      setQrUrl]      = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const [emailForm,  setEmailForm]  = useState({ email: "", name: "", role: "member" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "fail"; text: string } | null>(null);

  const startInvite = useCallback(async () => {
    setPhase("loading");
    try {
      const [inviteRes, settingsRes] = await Promise.all([
        fetch("/api/users/invite"),
        fetch("/api/server/settings"),
      ]);
      if (!inviteRes.ok) throw new Error("invite failed");
      const data = await inviteRes.json() as { connectionString: string; token: string; serverDid: string | null };
      const { walletUrl } = await settingsRes.json() as { walletUrl: string };
      const base = walletUrl ?? "https://wallet.vaultys.net";
      const didParam = data.serverDid ? `&did=${encodeURIComponent(data.serverDid)}` : "";
      setQrUrl(`${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`);
      setPhase("qr");
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/user/listen/${data.token}`);
        const { status: s } = await r.json() as { status: number };
        if (s === 2)  { setPhase("success"); setAddedCount((n) => n + 1); return; }
        if (s === -2) { setPhase("failure"); return; }
      }
      setPhase("failure");
    } catch { setPhase("failure"); }
  }, []);

  const isIdle = phase === "idle" || phase === "failure";

  const sendEmailInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.email || !emailForm.name) return;
    setEmailSending(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/users/invite/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailForm),
      });
      if (res.ok) {
        setEmailMsg({ type: "ok", text: `Invitation sent to ${emailForm.email}` });
        setEmailForm({ email: "", name: "", role: "member" });
        setAddedCount((n) => n + 1);
      } else {
        setEmailMsg({ type: "fail", text: "Failed to send invitation" });
      }
    } catch {
      setEmailMsg({ type: "fail", text: "Network error" });
    } finally {
      setEmailSending(false);
    }
  }, [emailForm]);

  return (
    <div className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Invite teammates so they can manage agents and workflows alongside you.
      </p>

      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-vc-raised border border-vc-border rounded-xl">
        {(["qr", "email", "entra"] as const).map((t) => (
          <button
            key={t} type="button" onClick={() => { setTab(t); setPhase("idle"); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === t
                ? "bg-vc-surface border border-vc-border text-vc-text shadow-sm"
                : "text-vc-muted hover:text-vc-text"
            }`}
          >
            {t === "qr" ? "QR Code" : t === "email" ? "Email Invite" : "Microsoft Entra ID"}
          </button>
        ))}
      </div>

      {/* QR tab */}
      {tab === "qr" && (
        <>
          {phase === "idle" && (
            <div className="text-center py-4 space-y-4">
              {addedCount > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">✓ {addedCount} user{addedCount > 1 ? "s" : ""} invited</p>
              )}
              <p className="text-vc-muted text-sm">Generate a one-time QR code. The user scans it with their Vaultys wallet.</p>
              <button onClick={startInvite} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
                {addedCount > 0 ? "Invite another" : "Generate Invite QR"}
              </button>
            </div>
          )}

          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-vc-muted text-sm">Creating secure channel…</p>
            </div>
          )}

          {phase === "qr" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="bg-white p-3 rounded-2xl shadow-lg">
                <QRCodeSVG value={qrUrl} size={180} />
              </div>
              <div className="flex items-center gap-2 text-vc-subtle text-xs">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Waiting for wallet connection…
              </div>
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/15 border border-green-300 dark:border-green-500/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-vc-text font-medium">{addedCount} user{addedCount > 1 ? "s" : ""} registered!</p>
              <div className="flex gap-2">
                <button onClick={() => { setPhase("idle"); setQrUrl(""); }} className="px-4 py-1.5 text-sm border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised rounded-xl transition-colors">
                  Invite another
                </button>
                <button onClick={onNext} className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {phase === "failure" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-red-600 dark:text-red-400 text-sm">Invitation timed out or failed.</p>
              <button onClick={() => setPhase("idle")} className="px-4 py-1.5 text-sm border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised rounded-xl transition-colors">
                Try again
              </button>
            </div>
          )}
        </>
      )}

      {/* Email tab */}
      {tab === "email" && (
        <form onSubmit={sendEmailInvite} className="space-y-4">
          <p className="text-vc-muted text-sm">Send a registration link via email</p>

          <div className="space-y-3">
            <Field
              label="Email" type="email"
              value={emailForm.email}
              onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
              placeholder="user@example.com"
              required
            />
            <Field
              label="Name"
              value={emailForm.name}
              onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
              placeholder="John Doe"
              required
            />
            <div>
              <label className="block text-xs text-vc-muted mb-1.5">Role</label>
              <select
                value={emailForm.role}
                onChange={(e) => setEmailForm({ ...emailForm, role: e.target.value })}
                className="w-full bg-vc-raised border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="member">Member</option>
                <option value="operator">Operator</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {addedCount > 0 && (
            <p className="text-sm text-green-600 dark:text-green-400">✓ {addedCount} invitation{addedCount > 1 ? "s" : ""} sent</p>
          )}

          {emailMsg && (
            <p className={`text-xs px-3 py-2 rounded-xl border ${
              emailMsg.type === "ok"
                ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/40 text-green-700 dark:text-green-400"
                : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/40 text-red-600 dark:text-red-400"
            }`}>
              {emailMsg.text}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit" disabled={emailSending || !emailForm.email || !emailForm.name}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
            >
              {emailSending ? "Sending…" : "Send Invitation"}
            </button>
          </div>
        </form>
      )}

      {/* Entra tab */}
      {tab === "entra" && (
        <div className="text-center py-6 space-y-4">
          <div className="text-4xl">🏢</div>
          <p className="text-vc-muted text-sm">Connect Microsoft Entra ID (Azure AD) to sync users from your directory.</p>
          <p className="text-vc-subtle text-xs">
            Configure this in <strong className="text-vc-muted">Server Settings → Identity Providers</strong> after the wizard.
          </p>
        </div>
      )}

      {/* Footer — only shown when not mid-flow */}
      {(isIdle || tab === "email" || tab === "entra") && (
        <StepFooter>
          {(addedCount > 0 || tab === "email" || tab === "entra") && (
            <button
              onClick={onNext}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </StepFooter>
      )}
    </div>
  );
}

// ─── Step 4 — Agents ──────────────────────────────────────────────────────────

interface AgentEntry {
  id: string;
  name: string;
  online: boolean;
  capabilities: string[];
}

function AgentStep({ onNext }: { onNext: () => void }) {
  const router = useRouter();
  const [agents,   setAgents]   = useState<AgentEntry[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch("/api/agents?pageSize=20")
      .then((r) => r.json())
      .then((d: { agents?: AgentEntry[] }) => setAgents(d.agents ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  return (
    <div className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Register your first AI agent. Agents connect via WebSocket and receive tasks cryptographically signed by the control plane.
      </p>

      {fetching ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agents.length > 0 ? (
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 bg-vc-raised border border-vc-border rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-vc-surface border border-vc-border flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-vc-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-vc-text truncate">{a.name}</p>
                {a.capabilities.length > 0 && (
                  <p className="text-xs text-vc-subtle truncate">{a.capabilities.slice(0, 3).join(", ")}{a.capabilities.length > 3 ? ` +${a.capabilities.length - 3}` : ""}</p>
                )}
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium shrink-0 ${
                a.online
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-vc-subtle"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${a.online ? "bg-emerald-500" : "bg-vc-border"}`} />
                {a.online ? "Online" : "Offline"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "🔗", title: "Install SDK",  desc: "Add the VaultysClaw agent package to your project." },
            { icon: "🔑", title: "Register",     desc: "Agent presents its VaultysID — you approve it here." },
            { icon: "🎛️", title: "Assign caps",  desc: "Control what tools and resources each agent can use." },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-vc-raised border border-vc-border rounded-xl p-3 text-center">
              <div className="text-2xl mb-2">{icon}</div>
              <p className="text-xs font-semibold text-vc-text mb-1">{title}</p>
              <p className="text-xs text-vc-muted leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      )}

      <StepFooter>
        {agents.length === 0 ? (
          <button
            onClick={() => { onNext(); router.push("/agents/create"); }}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Bot className="w-4 h-4" /> Create first agent
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Continue →
          </button>
        )}
      </StepFooter>
    </div>
  );
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function DoneStep({ completedSteps, onClose }: { completedSteps: Set<StepId>; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/30 flex items-center justify-center">
        <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-vc-text">VaultysClaw is ready!</h2>
        <p className="text-vc-muted text-sm mt-2 max-w-sm mx-auto">
          Your control plane is configured. Every setting is adjustable at any time from the sidebar.
        </p>
      </div>

      <div className="w-full space-y-2 text-left">
        {STEPS.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25 text-green-700 dark:text-green-400"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-medium">{label}</span>
              <Check className="w-4 h-4 shrink-0" />
            </div>
          ))}
      </div>

      <button
        onClick={onClose}
        className="mt-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
      >
        Launch dashboard
      </button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  currentIdx,
  done,
  completedSteps,
  onGoToStep,
  onFinishLater,
}: {
  currentIdx: number;
  done: boolean;
  completedSteps: Set<StepId>;
  onGoToStep: (idx: number) => void;
  onFinishLater: () => void;
}) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-vc-surface border-r border-vc-border p-6 gap-8">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-sm leading-none shadow shadow-indigo-600/30">
          🦞
        </div>
        <span className="font-bold text-vc-text tracking-tight">VaultysClaw</span>
      </div>

      {/* Steps nav */}
      <div>
        <p className="text-vc-subtle text-[10px] font-bold uppercase tracking-widest mb-3 px-1">Setup</p>
        <nav className="space-y-0.5">
          {STEPS.map(({ id, label, desc, icon: Icon }, idx) => {
            const isActive    = !done && idx === currentIdx;
            const isPast      = done || idx < currentIdx;
            const isCompleted = completedSteps.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => !done && onGoToStep(idx)}
                disabled={done}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  done ? "cursor-default" : "cursor-pointer"
                } ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/40 text-indigo-900 dark:text-white"
                    : isPast && isCompleted
                    ? "text-green-600 dark:text-green-400 hover:bg-vc-raised"
                    : !done
                    ? "text-vc-subtle hover:bg-vc-raised hover:text-vc-muted"
                    : "text-vc-subtle"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                  isActive
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : isPast && isCompleted
                    ? "bg-green-100 dark:bg-green-500/15 border-green-200 dark:border-green-500/30 text-green-600 dark:text-green-400"
                    : "bg-vc-raised border-vc-border text-vc-subtle"
                }`}>
                  {isPast && isCompleted
                    ? <Check className="w-3.5 h-3.5" />
                    : <Icon className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{label}</p>
                  <p className={`text-[10px] truncate ${
                    isActive ? "text-indigo-600/70 dark:text-indigo-300/60" : "text-vc-subtle"
                  }`}>{desc}</p>
                </div>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Finish later */}
      <div className="mt-auto space-y-3">
        <button
          onClick={onFinishLater}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-vc-muted hover:text-vc-text border border-vc-border hover:bg-vc-raised rounded-xl transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Finish later
        </button>
        <p className="text-vc-subtle text-[10px] text-center leading-relaxed opacity-70">
          Your progress is saved. Return from the dashboard banner.
        </p>
      </div>
    </aside>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [loading,        setLoading]        = useState(true);
  const [currentIdx,     setCurrentIdx]     = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [done,           setDone]           = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_DONE)) {
      router.replace("/");
      return;
    }
    const load = async () => {
      let backendStatus: { model: boolean; email: boolean; users: boolean; agent: boolean } | null = null;
      try {
        // Fetch actual setup status from backend
        const res = await fetch("/api/setup/status");
        const data = await res.json() as { status?: { model: boolean; email: boolean; users: boolean; agent: boolean } };
        if (data.status) {
          backendStatus = data.status;
          const completed: StepId[] = [];
          if (data.status.model) completed.push("model");
          if (data.status.email) completed.push("email");
          if (data.status.users) completed.push("users");
          if (data.status.agent) completed.push("agent");
          setCompletedSteps(new Set(completed));
        }
      } catch { /* fall back to localStorage */ }

      // Load local state
      const state = loadWizardState();
      // Ensure currentIdx is within bounds
      const validStep = Math.min(state.step, STEP_IDS.length - 1);
      setCurrentIdx(validStep);

      // Only mark as done if BOTH localStorage AND backend agree all steps are complete
      if (state.step >= STEP_IDS.length && backendStatus &&
          backendStatus.model && backendStatus.email && backendStatus.users && backendStatus.agent) {
        setDone(true);
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const currentStep = STEP_IDS[currentIdx];

  /** Jump to any step (preserves completion state) */
  const goToStep = (idx: number) => {
    if (done) return;
    setCurrentIdx(idx);
    saveWizardState({ step: idx, completed: Array.from(completedSteps) });
  };

  /** Verify step completion by fetching backend status, then advance */
  const advance = async () => {
    try {
      // Check if the current step is actually complete on the backend
      const res = await fetch("/api/setup/status");
      const data = await res.json() as { status?: Record<string, boolean> };
      // Use optional chaining to safely check if step is complete
      if (!data.status?.[currentStep]) {
        // Step not actually complete yet, don't advance
        return;
      }
    } catch (err) {
      // If we can't verify, don't advance — require backend confirmation
      console.warn("Could not verify setup status:", err);
      return;
    }

    const newSet = new Set([...Array.from(completedSteps), currentStep]);
    setCompletedSteps(newSet);
    const nextIdx = currentIdx + 1;
    if (nextIdx < STEP_IDS.length) {
      setCurrentIdx(nextIdx);
      saveWizardState({ step: nextIdx, completed: Array.from(newSet) });
    } else {
      setDone(true);
      saveWizardState({ step: nextIdx, completed: Array.from(newSet) });
    }
  };

  /** Fully finish — sets done flag */
  const finish = (target: string = "/") => {
    localStorage.setItem(LS_DONE, "1");
    router.push(target);
  };

  /** Save progress and return to dashboard — banner will reappear */
  const finishLater = () => router.push("/");

  if (loading) return null;

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 dark:from-gray-950 dark:via-indigo-950 dark:to-gray-950">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-indigo-200/40 dark:bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-200/30 dark:bg-purple-600/8 rounded-full blur-3xl" />
      </div>

      {/* Sidebar */}
      <Sidebar
        currentIdx={currentIdx}
        done={done}
        completedSteps={completedSteps}
        onGoToStep={goToStep}
        onFinishLater={finishLater}
      />

      {/* Main content */}
      <div className="relative flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-5 py-4 bg-vc-surface border-b border-vc-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs shadow shadow-indigo-600/30">🦞</div>
            <span className="font-bold text-vc-text text-sm">VaultysClaw Setup</span>
          </div>
          <button
            onClick={finishLater}
            className="text-xs text-vc-muted hover:text-vc-text border border-vc-border hover:bg-vc-raised px-3 py-1.5 rounded-lg transition-colors"
          >
            Finish later
          </button>
        </header>

        {/* Content area */}
        <div className="flex-1 flex flex-col items-center p-6 md:p-12 pt-10 md:pt-14">
          <div className="w-full max-w-2xl animate-fade-in-up">
            {done ? (
              <DoneStep completedSteps={completedSteps} onClose={() => finish("/")} />
            ) : (
              <>
                {/* Step header — pinned to top */}
                <div className="mb-1">
                  <span className="text-vc-subtle text-xs font-semibold uppercase tracking-widest">
                    Step {currentIdx + 1} of {STEP_IDS.length}
                  </span>
                </div>
                <h1 className="text-3xl font-bold text-vc-text mb-1">{STEPS[currentIdx].label}</h1>
                <p className="text-vc-muted text-sm mb-8">{STEPS[currentIdx].desc}</p>

                {/* Step progress */}
                <StepProgress currentIdx={currentIdx} completedSteps={completedSteps} />

                {/* Step card */}
                <div className="bg-vc-surface border border-vc-border rounded-2xl p-6 shadow-sm">
                  {currentStep === "model" && <ModelStep onNext={() => advance()} />}
                  {currentStep === "email" && <EmailStep onNext={() => advance()} />}
                  {currentStep === "users" && <UsersStep onNext={() => advance()} />}
                  {currentStep === "agent" && <AgentStep onNext={() => advance()} />}
                </div>

                {/* Mobile step dots */}
                <div className="flex items-center justify-center gap-2 mt-5 md:hidden">
                  {STEPS.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => goToStep(i)}
                      className={`rounded-full transition-all ${
                        i === currentIdx ? "w-4 h-2 bg-indigo-500 dark:bg-indigo-400" :
                        i < currentIdx   ? "w-2 h-2 bg-indigo-400/60 dark:bg-indigo-600/60" :
                                           "w-2 h-2 bg-vc-border"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
