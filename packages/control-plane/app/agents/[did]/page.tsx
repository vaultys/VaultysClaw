"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAdminWS } from "../../../hooks/useAdminWS";
import type { LlmProviderType, GraphNode } from "@vaultysclaw/shared";
import dynamic from "next/dynamic";

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), { ssr: false });

const ALL_CAPABILITIES = [
  { id: "file_access", label: "File Access" },
  { id: "internet_access", label: "Internet Access" },
  { id: "browser_control", label: "Browser Control" },
  { id: "api_call", label: "API Call" },
  { id: "mail_send", label: "Mail Send" },
  { id: "code_execution", label: "Code Execution" },
  { id: "system_command", label: "System Command" },
] as const;

interface AgentDetail {
  id: string;
  name: string;
  capabilities: string[];
  publicKey: string | null;
  certificateInfo: Record<string, unknown> | null;
  agentVaultysId: Record<string, unknown> | null;
  registeredAt: string;
  lastSeen: string;
  online: boolean;
  connectedAt: string | null;
  lastHeartbeat: string | null;
}

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor(
    (Date.now() - parseUTC(iso).getTime()) / 1000
  );
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return parseUTC(iso).toLocaleString();
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const did = decodeURIComponent(params.did as string);

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editCaps, setEditCaps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // LLM config state
  interface LlmConfigDisplay {
    provider: LlmProviderType;
    model: string;
    baseUrl?: string;
    systemPrompt?: string;
    maxTokens?: number;
    apiKeySet: boolean;
  }
  const [llmConfig, setLlmConfig] = useState<LlmConfigDisplay | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmEditing, setLlmEditing] = useState(false);
  const [llmForm, setLlmForm] = useState({
    provider: "openai" as LlmProviderType,
    model: "",
    apiKey: "",
    baseUrl: "",
    systemPrompt: "",
    maxTokens: "",
  });
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmStatus, setLlmStatus] = useState<"idle" | "saved" | "cleared" | "error">("idle");

  const PROVIDER_OPTIONS: { value: LlmProviderType; label: string; needsKey: boolean; needsUrl: boolean }[] = [
    { value: "openai", label: "OpenAI", needsKey: true, needsUrl: false },
    { value: "anthropic", label: "Anthropic", needsKey: true, needsUrl: false },
    { value: "google", label: "Google Gemini", needsKey: true, needsUrl: false },
    { value: "ollama", label: "Ollama (local)", needsKey: false, needsUrl: true },
    { value: "openai-compatible", label: "OpenAI-compatible", needsKey: true, needsUrl: true },
  ];

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.value === llmForm.provider)!

  // Live status from admin WebSocket
  const { agents: agentsState, lastEvent } = useAdminWS();
  const liveAgent = agentsState.agents.find((a) => a.id === did);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}`);
      if (res.status === 404) {
        setError("Agent not found");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AgentDetail = await res.json();
      setAgent(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agent");
    } finally {
      setLoading(false);
    }
  }, [did]);

  // Fetch detail once on mount (for certificate/VaultysId data)
  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  // Fetch LLM config on mount
  useEffect(() => {
    fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`)
      .then((r) => r.json())
      .then((data: { config: LlmConfigDisplay | null }) => {
        setLlmConfig(data.config);
        if (data.config) {
          setLlmForm({
            provider: data.config.provider,
            model: data.config.model,
            apiKey: "", // never pre-filled
            baseUrl: data.config.baseUrl ?? "",
            systemPrompt: data.config.systemPrompt ?? "",
            maxTokens: data.config.maxTokens?.toString() ?? "",
          });
        }
      })
      .catch(() => { })
      .finally(() => setLlmLoading(false));
  }, [did]);

  // Merge live status into agent detail when WS pushes updates
  useEffect(() => {
    if (liveAgent && agent) {
      setAgent((prev) =>
        prev
          ? {
            ...prev,
            online: liveAgent.online,
            connectedAt: liveAgent.connectedAt,
            lastHeartbeat: liveAgent.lastHeartbeat,
            lastSeen: liveAgent.lastSeen,
            capabilities: liveAgent.capabilities,
            name: liveAgent.name,
          }
          : prev
      );
    }
  }, [liveAgent]);

  // Re-fetch full detail (certificate, VaultysId) after re-auth events
  useEffect(() => {
    if (lastEvent === "agent_reconnected" || lastEvent === "capabilities_updated") {
      fetchAgent();
    }
  }, [lastEvent, fetchAgent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-vc-muted">Loading agent details...</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/")}
          className="text-indigo-400 hover:text-indigo-300 mb-6 inline-block text-sm"
        >
          ← Back to Dashboard
        </button>
        <div className="bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-lg px-4 py-3 text-red-600 dark:text-red-300">
          {error ?? "Agent not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <header className="bg-vc-surface border border-vc-border rounded-xl">
        <div className="px-5 py-5">
          <button
            onClick={() => router.push("/")}
            className="text-indigo-400 hover:text-indigo-300 text-sm mb-3 inline-block"
          >
            ← Back to Dashboard
          </button>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-3 text-vc-text">
                {agent.name}
                {agent.online ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-vc-muted">
                    <span className="w-2 h-2 bg-vc-ring rounded-full"></span>
                    Offline
                  </span>
                )}
              </h1>
              <p className="text-vc-muted text-sm font-mono mt-1">{agent.id}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="space-y-6">
        {/* Connection Status */}
        <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
          <h2 className="text-base font-semibold text-vc-text mb-4">Connection</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-vc-muted text-xs uppercase mb-1">Status</div>
              <div className={agent.online ? "text-green-400" : "text-vc-muted"}>
                {agent.online ? "Connected" : "Disconnected"}
              </div>
            </div>
            <div>
              <div className="text-vc-muted text-xs uppercase mb-1">Connected Since</div>
              <div className="text-vc-text">{formatDate(agent.connectedAt)}</div>
            </div>
            <div>
              <div className="text-vc-muted text-xs uppercase mb-1">Last Heartbeat</div>
              <div className="text-vc-text">
                {agent.online
                  ? timeAgo(agent.lastHeartbeat)
                  : "—"}
              </div>
            </div>
          </div>
        </section>

        {/* Identity & Registration */}
        <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
          <h2 className="text-base font-semibold text-vc-text mb-4">Identity</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-vc-muted text-xs uppercase">DID</dt>
              <dd className="font-mono text-sm break-all text-vc-text-2">{agent.id}</dd>
            </div>
            <div>
              <dt className="text-vc-muted text-xs uppercase">Name</dt>
              <dd className="text-vc-text">{agent.name}</dd>
            </div>
            <div>
              <dt className="text-vc-muted text-xs uppercase">Registered At</dt>
              <dd className="text-vc-text">{formatDate(agent.registeredAt)}</dd>
            </div>
            <div>
              <dt className="text-vc-muted text-xs uppercase">Last Seen</dt>
              <dd className="text-vc-text">
                {formatDate(agent.lastSeen)}{" "}
                <span className="text-vc-subtle">({timeAgo(agent.lastSeen)})</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Capabilities */}
        <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-vc-text">Capabilities</h2>
            {!editing ? (
              <button
                onClick={() => { setEditCaps([...agent.capabilities]); setEditing(true); }}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="text-sm text-vc-muted hover:text-vc-text px-3 py-1"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const res = await fetch(`/api/agents/${encodeURIComponent(did)}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ capabilities: editCaps }),
                      });
                      if (!res.ok) throw new Error("Failed to update");
                      setEditing(false);
                      // Certificate will refresh automatically via WS event after re-auth
                    } catch {
                      // keep editing mode open
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1 rounded"
                >
                  {saving ? "Saving…" : "Save & Reissue Certificate"}
                </button>
              </div>
            )}
          </div>
          {editing ? (
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => {
                const active = editCaps.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    onClick={() =>
                      setEditCaps(
                        active
                          ? editCaps.filter((c) => c !== cap.id)
                          : [...editCaps, cap.id]
                      )
                    }
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${active
                      ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-300"
                      : "bg-vc-raised/40 border-vc-ring text-vc-muted hover:border-vc-muted"
                      }`}
                  >
                    {cap.label}
                  </button>
                );
              })}
            </div>
          ) : agent.capabilities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-300 px-3 py-1.5 rounded-md text-sm"
                >
                  {cap}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-vc-muted text-sm">No capabilities declared.</p>
          )}
        </section>

        {/* LLM Configuration */}
        <section className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-vc-border">
            <h2 className="text-base font-semibold text-vc-text">LLM Configuration</h2>
            {!llmEditing && !llmLoading && (
              <div className="flex items-center gap-2">
                {llmConfig && (
                  <button
                    onClick={async () => {
                      if (!confirm("Clear LLM config? The agent will fall back to its local env-var config.")) return;
                      setLlmSaving(true);
                      try {
                        const res = await fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`, { method: "DELETE" });
                        if (res.ok) {
                          setLlmConfig(null);
                          setLlmStatus("cleared");
                          setTimeout(() => setLlmStatus("idle"), 2500);
                        } else {
                          setLlmStatus("error");
                        }
                      } catch { setLlmStatus("error"); }
                      finally { setLlmSaving(false); }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setLlmEditing(true)}
                  className="text-sm text-indigo-400 hover:text-indigo-300"
                >
                  {llmConfig ? "Edit" : "Configure"}
                </button>
              </div>
            )}
          </div>

          <div className="p-6">
            {llmLoading ? (
              <p className="text-vc-muted text-sm">Loading…</p>
            ) : llmEditing ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setLlmSaving(true);
                  setLlmStatus("idle");
                  try {
                    const body: Record<string, unknown> = {
                      provider: llmForm.provider,
                      model: llmForm.model,
                    };
                    if (llmForm.apiKey) body.apiKey = llmForm.apiKey;
                    if (llmForm.baseUrl) body.baseUrl = llmForm.baseUrl;
                    if (llmForm.systemPrompt) body.systemPrompt = llmForm.systemPrompt;
                    if (llmForm.maxTokens) body.maxTokens = parseInt(llmForm.maxTokens, 10);

                    const res = await fetch(`/api/agents/${encodeURIComponent(did)}/llm-config`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    if (res.ok) {
                      const data = await res.json() as { config: LlmConfigDisplay };
                      setLlmConfig(data.config);
                      setLlmEditing(false);
                      setLlmStatus("saved");
                      setTimeout(() => setLlmStatus("idle"), 2500);
                    } else {
                      const data = await res.json().catch(() => ({})) as { error?: string };
                      alert(data.error ?? "Failed to save LLM config");
                      setLlmStatus("error");
                    }
                  } catch { setLlmStatus("error"); }
                  finally { setLlmSaving(false); }
                }}
                className="space-y-4"
              >
                {/* Provider */}
                <div>
                  <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">Provider</label>
                  <select
                    value={llmForm.provider}
                    onChange={(e) => setLlmForm((f) => ({ ...f, provider: e.target.value as LlmProviderType }))}
                    className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    {PROVIDER_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Model */}
                <div>
                  <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">Model</label>
                  <input
                    type="text"
                    required
                    value={llmForm.model}
                    onChange={(e) => setLlmForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder={
                      llmForm.provider === "openai" ? "gpt-4o"
                        : llmForm.provider === "anthropic" ? "claude-sonnet-4-5"
                          : llmForm.provider === "google" ? "gemini-2.5-flash"
                            : llmForm.provider === "ollama" ? "llama3.2"
                              : "model-name"
                    }
                    className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                {/* API Key */}
                {selectedProvider.needsKey && (
                  <div>
                    <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">
                      API Key {llmConfig?.apiKeySet && <span className="text-emerald-500 normal-case">(stored — leave blank to keep)</span>}
                    </label>
                    <input
                      type="password"
                      value={llmForm.apiKey}
                      onChange={(e) => setLlmForm((f) => ({ ...f, apiKey: e.target.value }))}
                      placeholder={llmConfig?.apiKeySet ? "••••••••••••••••" : "sk-…"}
                      className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                )}

                {/* Base URL */}
                {selectedProvider.needsUrl && (
                  <div>
                    <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">Base URL</label>
                    <input
                      type="url"
                      value={llmForm.baseUrl}
                      onChange={(e) => setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))}
                      placeholder={llmForm.provider === "ollama" ? "http://localhost:11434/api" : "http://localhost:1234/v1"}
                      className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                )}

                {/* System Prompt */}
                <div>
                  <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">
                    System Prompt <span className="normal-case text-vc-subtle">(optional — overrides default)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={llmForm.systemPrompt}
                    onChange={(e) => setLlmForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                    placeholder="You are a secure agent…"
                    className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
                  />
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="text-xs text-vc-subtle uppercase tracking-wider font-medium block mb-1.5">Max Tokens <span className="normal-case text-vc-subtle">(optional)</span></label>
                  <input
                    type="number"
                    min={1}
                    value={llmForm.maxTokens}
                    onChange={(e) => setLlmForm((f) => ({ ...f, maxTokens: e.target.value }))}
                    placeholder="4096"
                    className="w-full bg-vc-raised border border-vc-ring rounded-lg px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setLlmEditing(false); setLlmStatus("idle"); }}
                    className="text-sm text-vc-muted hover:text-vc-text px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={llmSaving}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Save & Push to Agent"}
                  </button>
                </div>
              </form>
            ) : llmConfig ? (
              <dl className="space-y-3">
                <div>
                  <dt className="text-vc-muted text-xs uppercase">Provider</dt>
                  <dd className="text-vc-text capitalize">{PROVIDER_OPTIONS.find(p => p.value === llmConfig.provider)?.label ?? llmConfig.provider}</dd>
                </div>
                <div>
                  <dt className="text-vc-muted text-xs uppercase">Model</dt>
                  <dd className="text-vc-text font-mono">{llmConfig.model}</dd>
                </div>
                {llmConfig.baseUrl && (
                  <div>
                    <dt className="text-vc-muted text-xs uppercase">Base URL</dt>
                    <dd className="text-vc-text font-mono text-sm">{llmConfig.baseUrl}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-vc-muted text-xs uppercase">API Key</dt>
                  <dd className="text-vc-text">{llmConfig.apiKeySet ? <span className="text-emerald-500">Stored</span> : <span className="text-vc-subtle">Not set</span>}</dd>
                </div>
                {llmConfig.systemPrompt && (
                  <div>
                    <dt className="text-vc-muted text-xs uppercase">System Prompt</dt>
                    <dd className="text-vc-text-2 text-sm mt-1 bg-vc-raised rounded p-2 whitespace-pre-wrap">{llmConfig.systemPrompt}</dd>
                  </div>
                )}
                {llmConfig.maxTokens && (
                  <div>
                    <dt className="text-vc-muted text-xs uppercase">Max Tokens</dt>
                    <dd className="text-vc-text">{llmConfig.maxTokens}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-vc-muted text-sm">
                No remote config set. The agent will use its local environment variables (<code className="text-xs bg-vc-raised px-1 rounded">LLM_PROVIDER</code>, <code className="text-xs bg-vc-raised px-1 rounded">LLM_MODEL</code>, etc.).
              </p>
            )}

            {(llmStatus === "saved" || llmStatus === "cleared") && (
              <p className="text-emerald-500 text-xs mt-3">
                {llmStatus === "saved" ? "✓ Config saved and pushed to agent" : "✓ Config cleared"}
              </p>
            )}
            {llmStatus === "error" && (
              <p className="text-red-400 text-xs mt-3">Failed to update config</p>
            )}
          </div>
        </section>

        {/* Agent VaultysId */}
        <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
          <h2 className="text-base font-semibold text-vc-text mb-4">Agent VaultysId</h2>
          {agent.agentVaultysId ? (
            <pre className="bg-vc-raised rounded p-4 text-sm font-mono text-vc-text-2 overflow-x-auto">
              {JSON.stringify(agent.agentVaultysId, null, 2)}
            </pre>
          ) : (
            <p className="text-vc-muted text-sm">Not available.</p>
          )}
        </section>

        {/* Relationships Graph */}
        <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
          <h2 className="text-base font-semibold text-vc-text mb-4">Relationships</h2>
          <RealmGraph
            query={`?agent=${encodeURIComponent(agent.id)}`}
            height={400}
            onNodeClick={(node: GraphNode) => {
              if (node.type === "user") router.push(`/users/${encodeURIComponent(node.id.replace("user:", ""))}`);
              else if (node.type === "realm") router.push(`/realms/${node.id.replace("realm:", "")}`);
            }}
          />
        </section>

        {/* Certificate */}
        <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
          <h2 className="text-base font-semibold text-vc-text mb-4">Certificate</h2>
          {agent.certificateInfo ? (
            <pre className="bg-vc-raised rounded p-4 text-sm font-mono text-vc-text-2 overflow-x-auto">
              {JSON.stringify(agent.certificateInfo, null, 2)}
            </pre>
          ) : (
            <p className="text-vc-muted text-sm">
              No certificate stored. Agent has not completed authentication.
            </p>
          )}
        </section>

        {/* Task Management */}
        <TaskSection agentId={agent.id} />

        {/* Schedule Management */}
        <ScheduleSection agentId={agent.id} />

        {/* Tool Approvals */}
        <ToolApprovalsSection />

        {/* Activity History */}
        <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
          <h2 className="text-base font-semibold text-vc-text mb-4">Activity History</h2>
          <p className="text-vc-muted text-sm">
            Intent execution history will be available once intent logging is implemented.
          </p>
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Approvals Section
// ---------------------------------------------------------------------------

function ToolApprovalsSection() {
  const [approvals, setApprovals] = useState<Array<{ requestId: string; toolName: string; args: Record<string, unknown>; reason: string; agentName?: string; createdAt: number }>>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tool-approvals").then((r) => r.json()).catch(() => ({ approvals: [] }));
    setApprovals(res.approvals ?? []);
  }, []);

  useEffect(() => { refresh(); const iv = setInterval(refresh, 5000); return () => clearInterval(iv); }, [refresh]);

  const respond = async (requestId: string, approved: boolean) => {
    await fetch("/api/tool-approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, approved }),
    });
    refresh();
  };

  return (
    <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-vc-text">Tool Approvals</h2>
        <button onClick={refresh} className="text-xs text-vc-muted hover:text-vc-text">↻ Refresh</button>
      </div>
      {approvals.length === 0 ? (
        <p className="text-vc-muted text-sm">No pending tool approvals.</p>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div key={a.requestId} className="bg-vc-raised rounded-lg p-4 border border-vc-border">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm text-vc-text font-medium">{a.toolName}</span>
                  {a.agentName && <span className="ml-2 text-xs text-vc-muted">from {a.agentName}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => respond(a.requestId, true)}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">Approve</button>
                  <button onClick={() => respond(a.requestId, false)}
                    className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Reject</button>
                </div>
              </div>
              <p className="mt-1 text-xs text-vc-muted">{a.reason}</p>
              <pre className="mt-2 text-xs font-mono text-vc-text-2 bg-vc-surface rounded p-2 overflow-x-auto">
                {JSON.stringify(a.args, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Task Management Section
// ---------------------------------------------------------------------------

function TaskSection({ agentId }: { agentId: string }) {
  const [action, setAction] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const enqueue = async () => {
    if (!action.trim()) return;
    setStatus(null);
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setStatus(res.ok ? `Task sent: ${data.action}` : `Error: ${data.error}`);
    if (res.ok) setAction("");
  };

  return (
    <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
      <h2 className="text-base font-semibold text-vc-text mb-4">Enqueue Task</h2>
      <div className="flex gap-2">
        <input value={action} onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enqueue()}
          placeholder="Task action…"
          className="flex-1 px-3 py-2 text-sm bg-vc-raised border border-vc-border rounded-lg text-vc-text"
        />
        <button onClick={enqueue}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Send</button>
      </div>
      {status && <p className={`mt-2 text-xs ${status.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{status}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Schedule Management Section
// ---------------------------------------------------------------------------

function ScheduleSection({ agentId }: { agentId: string }) {
  const [form, setForm] = useState({ id: "", name: "", cron: "", action: "" });
  const [status, setStatus] = useState<string | null>(null);

  const upsert = async () => {
    if (!form.id || !form.name || !form.cron || !form.action) {
      setStatus("All fields are required");
      return;
    }
    setStatus(null);
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setStatus(res.ok ? `Schedule "${form.name}" sent` : `Error: ${data.error}`);
    if (res.ok) setForm({ id: "", name: "", cron: "", action: "" });
  };

  const del = async () => {
    if (!form.id) { setStatus("Enter schedule ID to delete"); return; }
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/schedules?id=${encodeURIComponent(form.id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setStatus(res.ok ? `Schedule "${form.id}" deleted` : `Error: ${data.error}`);
  };

  return (
    <section className="bg-vc-surface rounded-xl border border-vc-border p-6">
      <h2 className="text-base font-semibold text-vc-text mb-4">Manage Schedules</h2>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
          placeholder="ID" className="px-3 py-2 text-sm bg-vc-raised border border-vc-border rounded-lg text-vc-text" />
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Name" className="px-3 py-2 text-sm bg-vc-raised border border-vc-border rounded-lg text-vc-text" />
        <input value={form.cron} onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
          placeholder="Cron (e.g. */5 * * * *)" className="px-3 py-2 text-sm bg-vc-raised border border-vc-border rounded-lg text-vc-text" />
        <input value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
          placeholder="Action" className="px-3 py-2 text-sm bg-vc-raised border border-vc-border rounded-lg text-vc-text" />
      </div>
      <div className="flex gap-2">
        <button onClick={upsert} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Upsert</button>
        <button onClick={del} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Delete by ID</button>
      </div>
      {status && <p className={`mt-2 text-xs ${status.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{status}</p>}
    </section>
  );
}
