"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  Save,
  Trash2,
  Zap,
  Key,
  BarChart3,
  BookOpen,
} from "lucide-react";

interface LiteLLMStatus {
  configured: boolean;
  healthy: boolean;
  baseUrl: string | null;
  masterKeySet: boolean;
  source: "db" | "env";
  stats: {
    modelCount: number;
    totalSpend: number | null;
    keyCount: number | null;
  };
}

export function LiteLLMPanel() {
  const [status, setStatus] = useState<LiteLLMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/litellm");
      const data = (await res.json()) as LiteLLMStatus;
      setStatus(data);
      if (data.baseUrl) setBaseUrl(data.baseUrl);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, string> = { baseUrl };
      if (masterKey) body.masterKey = masterKey;
      const res = await fetch("/api/settings/litellm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; healthy?: boolean; error?: string };
      if (data.ok) {
        setSaveMsg({ ok: true, text: data.healthy ? "Saved — proxy is healthy ✓" : "Saved — proxy did not respond (check URL)" });
        setMasterKey("");
        await load();
      } else {
        setSaveMsg({ ok: false, text: data.error ?? "Save failed" });
      }
    } catch (e) {
      setSaveMsg({ ok: false, text: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setSaveMsg(null);
    try {
      // Save first if URL changed, then reload
      const body: Record<string, string> = { baseUrl };
      if (masterKey) body.masterKey = masterKey;
      const res = await fetch("/api/settings/litellm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; healthy?: boolean };
      setSaveMsg({ ok: Boolean(data.healthy), text: data.healthy ? "Connection successful ✓" : "Could not reach proxy — check URL and master key" });
      if (data.ok) { setMasterKey(""); await load(); }
    } finally {
      setTesting(false);
    }
  };

  const clear = async () => {
    if (!confirm("Remove stored LiteLLM settings? The proxy will fall back to environment variables.")) return;
    await fetch("/api/settings/litellm", { method: "DELETE" });
    setBaseUrl("");
    setMasterKey("");
    await load();
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-foreground-500">Loading…</div>;
  }

  const dashboardUrl = status?.baseUrl ? `${status.baseUrl}/ui` : null;
  const docsUrl = status?.baseUrl ? `${status.baseUrl}/docs` : null;
  const isEnvOnly = status?.source === "env";

  return (
    <div className="space-y-6">

      {/* Status banner */}
      <div className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${
        status?.healthy
          ? "border-success-300 dark:border-success-800 bg-success-50 dark:bg-success-900/20"
          : status?.configured
          ? "border-warning-300 dark:border-warning-800 bg-warning-50 dark:bg-warning-900/20"
          : "border-neutral-200 bg-background-100"
      }`}>
        <div className="flex items-center gap-3">
          {status?.healthy ? (
            <CheckCircle2 className="w-5 h-5 text-success-600 dark:text-success-400 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-neutral-400 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {status?.healthy ? "LiteLLM proxy is reachable" : status?.configured ? "Proxy configured but not responding" : "LiteLLM not configured"}
            </p>
            {status?.baseUrl && (
              <p className="text-xs text-foreground-500 font-mono">{status.baseUrl}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dashboardUrl && (
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 bg-background text-foreground hover:bg-background-200 transition-colors">
              <Activity className="w-3.5 h-3.5" /> Dashboard <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          )}
          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 bg-background text-foreground hover:bg-background-200 transition-colors">
              <BookOpen className="w-3.5 h-3.5" /> API docs <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          )}
          <button onClick={load}
            className="p-1.5 rounded-lg border border-neutral-200 hover:bg-background-200 transition-colors text-foreground-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      {status?.configured && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-neutral-200 bg-background-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary-500" />
              <span className="text-xs text-foreground-500 font-medium uppercase tracking-wide">Models</span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {status.healthy ? status.stats.modelCount : "—"}
            </p>
            <p className="text-xs text-foreground-500 mt-0.5">registered in proxy</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-background-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 text-warning-500" />
              <span className="text-xs text-foreground-500 font-medium uppercase tracking-wide">Keys</span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {status.healthy && status.stats.keyCount != null ? status.stats.keyCount : "—"}
            </p>
            <p className="text-xs text-foreground-500 mt-0.5">virtual keys active</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-background-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-success-500" />
              <span className="text-xs text-foreground-500 font-medium uppercase tracking-wide">Spend</span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {status.healthy && status.stats.totalSpend != null
                ? `$${status.stats.totalSpend.toFixed(4)}`
                : "—"}
            </p>
            <p className="text-xs text-foreground-500 mt-0.5">total tracked</p>
          </div>
        </div>
      )}

      {/* Config form */}
      <div className="rounded-2xl border border-neutral-200 bg-background-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Connection settings</h3>
          {isEnvOnly && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 border border-primary-300 dark:border-primary-800 uppercase tracking-wide">
              From env vars
            </span>
          )}
        </div>

        {isEnvOnly && (
          <p className="text-xs text-foreground-500 bg-background-200 rounded-xl px-3 py-2">
            LiteLLM is currently configured via <code className="font-mono">LITELLM_BASE_URL</code> and <code className="font-mono">LITELLM_MASTER_KEY</code> environment variables.
            Saving here will store the settings in the database and override the env vars.
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Proxy URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="http://localhost:4000"
              className="w-full px-3 py-2 rounded-xl border border-neutral-200 bg-background text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Master key {status?.masterKeySet && !masterKey && <span className="text-success-600 dark:text-success-400">(set — leave blank to keep)</span>}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={masterKey}
                onChange={e => setMasterKey(e.target.value)}
                placeholder={status?.masterKeySet ? "••••••••••••••••" : "sk-…"}
                className="w-full px-3 py-2 pr-10 rounded-xl border border-neutral-200 bg-background text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-400 hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {saveMsg && (
          <p className={`text-xs px-3 py-2 rounded-xl ${saveMsg.ok ? "bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400" : "bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400"}`}>
            {saveMsg.text}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={testConnection}
            disabled={!baseUrl || testing || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 text-sm font-medium text-foreground hover:bg-background-200 transition-colors disabled:opacity-40"
          >
            <Activity className={`w-4 h-4 ${testing ? "animate-pulse" : ""}`} />
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button
            onClick={save}
            disabled={!baseUrl || saving || testing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save"}
          </button>
          {status?.source === "db" && (
            <button
              onClick={clear}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
