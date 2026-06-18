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
  Cpu,
  Search,
  X,
  Copy,
  Check,
} from "lucide-react";
import { litellmClient, unwrap } from "@/lib/api/ts-rest/client";

interface LiteLLMStatus {
  configured: boolean;
  healthy: boolean;
  status: "unconfigured" | "connecting" | "connected" | "error";
  baseUrl: string | null;
  masterKeySet: boolean;
  source: "db" | "env";
  lastError: string | null;
  checkedAt: string | null;
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
  const [reconnecting, setReconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Models explorer
  const [models, setModels] = useState<{ name: string; params: Record<string, unknown> }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState<{
    name: string;
    params: Record<string, unknown>;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    if (!status?.configured) return;
    setModelsLoading(true);
    try {
      const { models } = unwrap(await litellmClient.models());
      setModels(models);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [status?.configured]);

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

  useEffect(() => {
    if (status?.healthy) {
      loadModels();
    }
  }, [status?.healthy, loadModels]);

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

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

  const reconnect = async () => {
    setReconnecting(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/settings/litellm", { method: "POST" });
      const data = await res.json() as { ok?: boolean; status?: string };
      setSaveMsg({ ok: Boolean(data.ok), text: data.ok ? "Reconnected successfully ✓" : "Could not reach proxy — check URL and master key" });
      await load();
    } finally {
      setReconnecting(false);
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
          ? "border-success-300 bg-success-50"
          : status?.configured
          ? "border-warning-300 bg-warning-50"
          : "border-neutral-200 bg-background-100"
      }`}>
        <div className="flex items-center gap-3">
          {status?.status === "connected" ? (
            <CheckCircle2 className="w-5 h-5 text-success-600 shrink-0" />
          ) : status?.status === "connecting" ? (
            <RefreshCw className="w-5 h-5 text-primary-500 animate-spin shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-neutral-400 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {status?.status === "connected" ? "LiteLLM proxy connected"
                : status?.status === "connecting" ? "Connecting…"
                : status?.configured ? "Proxy configured but not responding"
                : "LiteLLM not configured"}
            </p>
            {status?.baseUrl && (
              <p className="text-xs text-foreground-500 font-mono">{status.baseUrl}</p>
            )}
            {status?.lastError && (
              <p className="text-xs text-danger-600">{status.lastError}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Reconnect when configured but not healthy */}
          {status?.configured && status.status !== "connected" && (
            <button onClick={reconnect} disabled={reconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? "animate-spin" : ""}`} />
              {reconnecting ? "Reconnecting…" : "Reconnect"}
            </button>
          )}
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
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300 uppercase tracking-wide">
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
              Master key {status?.masterKeySet && !masterKey && <span className="text-success-600">(set — leave blank to keep)</span>}
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
          <p className={`text-xs px-3 py-2 rounded-xl ${saveMsg.ok ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700"}`}>
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
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-danger-600 hover:bg-danger-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Models explorer */}
      {status?.healthy && (
        <div className="rounded-2xl border border-neutral-200 bg-background-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary-500" />
              <h3 className="text-sm font-semibold text-foreground">Available Models</h3>
              {models.length > 0 && (
                <span className="text-xs text-foreground-400 ml-1">
                  ({filteredModels.length} of {models.length})
                </span>
              )}
            </div>
            <button
              onClick={() => loadModels()}
              disabled={modelsLoading}
              className="p-1 rounded-lg border border-neutral-200 hover:bg-background-200 transition-colors text-foreground-500"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${modelsLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {modelsLoading ? (
            <div className="px-5 py-8 text-center text-sm text-foreground-500">
              Loading models…
            </div>
          ) : models.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Cpu className="w-8 h-8 text-foreground-400 mx-auto mb-2" />
              <p className="text-sm text-foreground-500">No models registered in LiteLLM</p>
            </div>
          ) : (
            <>
              {/* Search bar */}
              <div className="px-5 py-3 border-b border-neutral-200 bg-background">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-400" />
                  <input
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />
                </div>
              </div>

              {/* Models table */}
              <div className="overflow-x-auto">
                {filteredModels.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-foreground-500">No models match your search</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-foreground-500 text-xs uppercase tracking-wider bg-background-200">
                        <th className="text-left px-5 py-3 font-medium">Model Name</th>
                        <th className="text-left px-5 py-3 font-medium">Parameters</th>
                        <th className="text-left px-5 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.map((m) => (
                        <tr
                          key={m.name}
                          className="border-b border-neutral-200/50 hover:bg-background-200/40 transition-colors last:border-0"
                        >
                          <td className="px-5 py-3">
                            <code className="text-sm font-mono text-foreground-700">
                              {m.name}
                            </code>
                          </td>
                          <td className="px-5 py-3">
                            {typeof m.params === "object" &&
                            m.params &&
                            Object.keys(m.params).length > 0 ? (
                              <div className="space-y-0.5">
                                {Object.entries(m.params)
                                  .slice(0, 2)
                                  .map(([key, value]) => (
                                    <div key={key} className="text-xs text-foreground-500">
                                      <span className="font-medium">{key}:</span>{" "}
                                      <code className="font-mono text-foreground-400">
                                        {String(value).substring(0, 40)}
                                        {String(value).length > 40 ? "…" : ""}
                                      </code>
                                    </div>
                                  ))}
                                {Object.keys(m.params).length > 2 && (
                                  <div className="text-xs text-foreground-400">
                                    +{Object.keys(m.params).length - 2} more
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-foreground-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => setSelectedModel(m)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-50 transition-colors font-medium"
                            >
                              View details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Model details modal */}
      {selectedModel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl border border-neutral-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 sticky top-0 bg-background">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-primary-500" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {selectedModel.name}
                  </h2>
                  <p className="text-xs text-foreground-500">Model details</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedModel(null)}
                className="p-1 rounded-lg hover:bg-background-200 transition-colors text-foreground-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 space-y-4">
              {/* Model name */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-foreground-500 uppercase tracking-wide">
                  Model Name
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm font-mono text-foreground">
                    {selectedModel.name}
                  </code>
                  <button
                    onClick={() =>
                      copyToClipboard(selectedModel.name, "model-name")
                    }
                    className="p-2 rounded-lg border border-neutral-200 hover:bg-background-200 transition-colors text-foreground-500"
                    title="Copy to clipboard"
                  >
                    {copiedField === "model-name" ? (
                      <Check className="w-4 h-4 text-success-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Parameters */}
              {typeof selectedModel.params === "object" &&
              selectedModel.params &&
              Object.keys(selectedModel.params).length > 0 ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-foreground-500 uppercase tracking-wide">
                    Parameters
                  </label>
                  <div className="space-y-2">
                    {Object.entries(selectedModel.params).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground-500 uppercase">
                            {key}
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(String(value), `param-${key}`)
                            }
                            className="p-1 rounded text-foreground-400 hover:text-foreground transition-colors"
                            title="Copy value"
                          >
                            {copiedField === `param-${key}` ? (
                              <Check className="w-3 h-3 text-success-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <code className="block px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm font-mono text-foreground-700 break-all">
                          {String(value)}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 bg-background-100 rounded-lg text-sm text-foreground-500">
                  No parameters available
                </div>
              )}

              {/* JSON view */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-foreground-500 uppercase tracking-wide">
                  Full JSON
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-xs font-mono text-foreground overflow-x-auto max-h-32 overflow-y-auto">
                    <pre>{JSON.stringify(selectedModel, null, 2)}</pre>
                  </code>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(selectedModel, null, 2),
                        "json"
                      )
                    }
                    className="p-2 rounded-lg border border-neutral-200 hover:bg-background-200 transition-colors text-foreground-500 shrink-0"
                    title="Copy JSON"
                  >
                    {copiedField === "json" ? (
                      <Check className="w-4 h-4 text-success-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200 flex items-center gap-2">
              <button
                onClick={() => setSelectedModel(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-neutral-200 text-foreground hover:bg-background-200 transition-colors text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
