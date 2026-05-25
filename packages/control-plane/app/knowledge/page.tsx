"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Globe,
  FileText,
  Bot,
  Globe2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";

// ── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeSource {
  id: string;
  realm_id: string;
  agent_did: string;
  name: string;
  source_type: string;
  config: string;
  status: "idle" | "syncing" | "ready" | "error";
  doc_count: number;
  chunk_count: number;
  last_synced_at: string | null;
  error: string | null;
  created_at: string;
  // joined
  realm_name?: string;
  agent_name?: string;
}

interface RealmOption { id: string; name: string }
interface AgentOption { did: string; name: string; online: boolean }

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: KnowledgeSource["status"] }) {
  const map = {
    idle:    { icon: <Clock size={12} />,        label: "Idle",    cls: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700" },
    syncing: { icon: <Loader2 size={12} className="animate-spin" />, label: "Syncing", cls: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800" },
    ready:   { icon: <CheckCircle2 size={12} />, label: "Ready",   cls: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800" },
    error:   { icon: <XCircle size={12} />,      label: "Error",   cls: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800" },
  };
  const { icon, label, cls } = map[status] ?? map.idle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ── Source type badge ─────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    url:   { icon: <Globe size={12} />,     label: "URL",   cls: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800" },
    text:  { icon: <FileText size={12} />,  label: "Text",  cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800" },
    files: { icon: <FileText size={12} />,  label: "Files", cls: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-800" },
  };
  const { icon, label, cls } = map[type] ?? map.url;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ── Create source modal ───────────────────────────────────────────────────────

function CreateSourceModal({
  realms,
  agents,
  onClose,
  onCreated,
}: {
  realms: RealmOption[];
  agents: AgentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [realmId, setRealmId] = useState(realms[0]?.id ?? "");
  const [agentDid, setAgentDid] = useState("");
  const [sourceType, setSourceType] = useState<"url" | "text">("url");
  const [urls, setUrls] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [chunkSize, setChunkSize] = useState("1000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredAgents = realmId
    ? agents // show all — realm membership is soft
    : agents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !realmId || !agentDid) { setError("Name, realm and agent are required."); return; }

    let config: Record<string, unknown> = { chunkSize: parseInt(chunkSize, 10) || 1000 };
    if (sourceType === "url") {
      const list = urls.split("\n").map(u => u.trim()).filter(Boolean);
      if (!list.length) { setError("Enter at least one URL."); return; }
      config.urls = list;
    } else {
      if (!textTitle || !textContent) { setError("Title and content are required for text sources."); return; }
      config.texts = [{ title: textTitle, content: textContent }];
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ realmId, agentDid, name, sourceType, config }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to create source");
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-vc-surface border border-vc-border rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-vc-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <h2 className="text-sm font-semibold text-vc-text">New Knowledge Source</h2>
          </div>
          <button onClick={onClose} className="text-vc-muted hover:text-vc-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. SharePoint Contracts"
              className="w-full px-3 py-2 rounded-lg bg-vc-bg border border-vc-border text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Realm + Agent */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Realm</label>
              <select
                value={realmId}
                onChange={e => { setRealmId(e.target.value); setAgentDid(""); }}
                className="w-full px-3 py-2 rounded-lg bg-vc-bg border border-vc-border text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">Select realm…</option>
                {realms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Agent</label>
              <select
                value={agentDid}
                onChange={e => setAgentDid(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-vc-bg border border-vc-border text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">Select agent…</option>
                {filteredAgents.map(a => (
                  <option key={a.did} value={a.did}>
                    {a.name}{!a.online ? " (offline)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Source type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Source type</label>
            <div className="flex gap-2">
              {(["url", "text"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSourceType(t)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    sourceType === t
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-vc-bg border-vc-border text-vc-muted hover:border-indigo-400"
                  }`}
                >
                  {t === "url" ? "🌐 URLs" : "📄 Inline text"}
                </button>
              ))}
            </div>
          </div>

          {/* Source config */}
          {sourceType === "url" ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">URLs <span className="normal-case font-normal">(one per line)</span></label>
              <textarea
                value={urls}
                onChange={e => setUrls(e.target.value)}
                placeholder={"https://example.com/docs\nhttps://example.com/policy"}
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-vc-bg border border-vc-border text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Document title</label>
                <input
                  value={textTitle}
                  onChange={e => setTextTitle(e.target.value)}
                  placeholder="e.g. Company Policy v2"
                  className="w-full px-3 py-2 rounded-lg bg-vc-bg border border-vc-border text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">Content</label>
                <textarea
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  placeholder="Paste document content here…"
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-vc-bg border border-vc-border text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            </div>
          )}

          {/* Advanced */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1 text-xs text-vc-muted hover:text-vc-text transition-colors"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Advanced settings
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-1">
                <label className="text-xs font-medium text-vc-muted uppercase tracking-wider">
                  Chunk size <span className="normal-case font-normal">(chars)</span>
                </label>
                <input
                  type="number"
                  value={chunkSize}
                  onChange={e => setChunkSize(e.target.value)}
                  min={100}
                  max={8000}
                  className="w-32 px-3 py-2 rounded-lg bg-vc-bg border border-vc-border text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <p className="text-xs text-vc-subtle">Default 1000. Larger = more context per chunk, fewer results.</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-vc-border text-sm text-vc-muted hover:text-vc-text hover:border-vc-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create source
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Row expand — shows config + error detail ──────────────────────────────────

function SourceDetail({ source }: { source: KnowledgeSource }) {
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(source.config); } catch { /**/ }

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {source.error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{source.error}</p>
        </div>
      )}
      {source.source_type === "url" && Array.isArray(config.urls) && (
        <div className="space-y-1">
          <p className="text-xs text-vc-muted font-medium uppercase tracking-wider">Indexed URLs</p>
          <ul className="space-y-1">
            {(config.urls as string[]).map(url => (
              <li key={url} className="flex items-center gap-2 text-xs text-vc-text">
                <Globe size={11} className="text-vc-subtle shrink-0" />
                <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-500 truncate">{url}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {source.source_type === "text" && Array.isArray(config.texts) && (
        <div className="space-y-1">
          <p className="text-xs text-vc-muted font-medium uppercase tracking-wider">Documents</p>
          <ul className="space-y-1">
            {(config.texts as { title: string }[]).map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-vc-text">
                <FileText size={11} className="text-vc-subtle shrink-0" />
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-xs text-vc-muted">
        {config.chunkSize != null && <span>Chunk size: <span className="text-vc-text">{String(config.chunkSize)}</span></span>}
        <span>Created: <span className="text-vc-text">{parseUTC(source.created_at).toLocaleDateString()}</span></span>
        <span>ID: <span className="text-vc-text font-mono">{source.id}</span></span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading: roleLoading } = useRole();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [realms, setRealms] = useState<RealmOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!roleLoading && !isGlobalAdmin) router.replace("/");
  }, [roleLoading, isGlobalAdmin, router]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ksRes, rlRes, agRes] = await Promise.all([
        fetch("/api/knowledge"),
        fetch("/api/realms"),
        fetch("/api/agents"),
      ]);
      const ksData = await ksRes.json() as { sources?: KnowledgeSource[] };
      const rlData = await rlRes.json() as { realms?: RealmOption[] };
      const agData = await agRes.json() as { agents?: AgentOption[] };
      setSources(ksData.sources ?? []);
      setRealms(rlData.realms ?? []);
      setAgents(agData.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll syncing sources every 3s
  useEffect(() => {
    const syncingOnes = sources.filter(s => s.status === "syncing");
    if (!syncingOnes.length) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [sources, load]);

  async function handleSync(source: KnowledgeSource) {
    setSyncingIds(s => new Set(s).add(source.id));
    try {
      const res = await fetch(`/api/knowledge/${source.id}/sync`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      showToast(`Sync started for "${source.name}"`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed", false);
    } finally {
      setSyncingIds(s => { const n = new Set(s); n.delete(source.id); return n; });
    }
  }

  async function handleDelete(source: KnowledgeSource) {
    if (!confirm(`Delete knowledge source "${source.name}"? This will remove all indexed chunks.`)) return;
    setDeletingIds(s => new Set(s).add(source.id));
    try {
      const res = await fetch(`/api/knowledge/${source.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showToast(`"${source.name}" deleted`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", false);
    } finally {
      setDeletingIds(s => { const n = new Set(s); n.delete(source.id); return n; });
    }
  }

  // Summary stats
  const total = sources.length;
  const ready = sources.filter(s => s.status === "ready").length;
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count ?? 0), 0);
  const errors = sources.filter(s => s.status === "error").length;

  if (roleLoading || !isGlobalAdmin) return null;

  const agentName = (did: string) => agents.find(a => a.did === did)?.name ?? did.slice(0, 14) + "…";
  const realmName = (id: string) => realms.find(r => r.id === id)?.name ?? id;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white transition-all ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-vc-text">Knowledge Bases</h1>
            <p className="text-xs text-vc-muted">Connect data sources — agents index and search them locally</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add source
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total sources",  value: total,       sub: "configured",      icon: <BookOpen size={16} />,     tone: "neutral" },
          { label: "Ready",          value: ready,       sub: "indexed & live",  icon: <CheckCircle2 size={16} />, tone: ready === total && total > 0 ? "ok" : "neutral" },
          { label: "Total chunks",   value: fmtCount(totalChunks), sub: "stored locally", icon: <FileText size={16} />,  tone: "neutral" },
          { label: "Errors",         value: errors,      sub: "need attention",  icon: <AlertTriangle size={16} />,tone: errors > 0 ? "danger" : "ok" },
        ].map(card => (
          <div key={card.label} className="bg-vc-surface border border-vc-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-vc-subtle uppercase tracking-wider font-medium">{card.label}</span>
              <span className={card.tone === "ok" ? "text-green-500" : card.tone === "danger" ? "text-red-500" : "text-indigo-500"}>
                {card.icon}
              </span>
            </div>
            <p className="text-2xl font-bold text-vc-text">{card.value}</p>
            {card.sub && <p className="text-xs text-vc-subtle">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* How it works callout */}
      {total === 0 && !loading && (
        <div className="rounded-2xl border border-vc-border border-dashed bg-vc-surface/40 p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-vc-subtle mx-auto" />
          <p className="text-sm font-medium text-vc-text">No knowledge sources yet</p>
          <p className="text-xs text-vc-muted max-w-md mx-auto">
            Connect a URL or paste text — an agent will fetch, chunk, and embed the content locally.
            The agent then uses <code className="bg-vc-raised px-1 rounded text-indigo-400">knowledge_search</code> automatically when answering relevant questions.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Add first source
          </button>
        </div>
      )}

      {/* Sources table */}
      {(loading || total > 0) && (
        <div className="rounded-2xl border border-vc-border bg-vc-surface overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-vc-muted">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vc-border text-vc-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Realm</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Agent</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Chunks</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Last sync</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(source => {
                  const isExpanded = expandedId === source.id;
                  const isSyncing = syncingIds.has(source.id) || source.status === "syncing";
                  const isDeleting = deletingIds.has(source.id);

                  return (
                    <>
                      <tr
                        key={source.id}
                        className="border-b border-vc-border/50 hover:bg-vc-raised/30 transition-colors last:border-0 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : source.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <TypeBadge type={source.source_type} />
                            <span className="font-medium text-vc-text truncate max-w-[140px]">{source.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="flex items-center gap-1.5 text-vc-muted text-xs">
                            <Globe2 size={12} className="shrink-0" />
                            {realmName(source.realm_id)}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="flex items-center gap-1.5 text-vc-muted text-xs">
                            <Bot size={12} className="shrink-0" />
                            {agentName(source.agent_did)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={source.status} />
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-vc-muted text-xs">
                          {source.status === "ready"
                            ? <span className="text-vc-text font-medium">{fmtCount(source.chunk_count)}</span>
                            : "—"}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs text-vc-muted">
                          {timeAgo(source.last_synced_at)}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSync(source)}
                              disabled={isSyncing || isDeleting}
                              title="Sync now"
                              className="p-1.5 rounded-lg text-vc-muted hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 transition-colors"
                            >
                              {isSyncing
                                ? <Loader2 size={15} className="animate-spin" />
                                : <RefreshCw size={15} />}
                            </button>
                            <button
                              onClick={() => handleDelete(source)}
                              disabled={isSyncing || isDeleting}
                              title="Delete"
                              className="p-1.5 rounded-lg text-vc-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
                            >
                              {isDeleting
                                ? <Loader2 size={15} className="animate-spin" />
                                : <Trash2 size={15} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${source.id}-detail`} className="bg-vc-bg/60 border-b border-vc-border/50">
                          <td colSpan={7}>
                            <SourceDetail source={source} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* How it works info box */}
      {total > 0 && (
        <div className="rounded-xl border border-vc-border bg-vc-surface/60 p-4 text-xs text-vc-muted space-y-1">
          <p className="font-medium text-vc-text text-sm">How agent-local RAG works</p>
          <p>1. <span className="text-vc-text">Sync</span> — the control plane sends the source config to the agent via WebSocket.</p>
          <p>2. <span className="text-vc-text">Ingest</span> — the agent fetches docs, chunks them, embeds with Ollama / OpenAI, and stores vectors in its local SQLite.</p>
          <p>3. <span className="text-vc-text">Search</span> — in conversations, the agent calls <code className="bg-vc-raised px-1 rounded text-indigo-400">knowledge_search</code> automatically. Data never leaves the agent&apos;s environment.</p>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateSourceModal
          realms={realms}
          agents={agents}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
