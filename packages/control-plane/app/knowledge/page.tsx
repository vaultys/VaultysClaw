"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Globe,
  FileText,
  Bot,
  Globe2,
  AlertTriangle,
  ChevronRight,
  WifiOff,
  Database,
  ArrowUpRight,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

interface AgentInfo {
  did: string;
  name: string;
  online: boolean;
}

interface RealmInfo { id: string; name: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function fmtCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: KnowledgeSource["status"] }) {
  const map = {
    idle:    "bg-zinc-400",
    syncing: "bg-blue-500 animate-pulse",
    ready:   "bg-green-500",
    error:   "bg-red-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[status] ?? map.idle}`} />;
}

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

function TypeIcon({ type }: { type: string }) {
  if (type === "url") return <Globe size={13} className="text-indigo-400 shrink-0" />;
  return <FileText size={13} className="text-amber-400 shrink-0" />;
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentKnowledgeCard({
  agent,
  sources,
  realms,
}: {
  agent: AgentInfo;
  sources: KnowledgeSource[];
  realms: RealmInfo[];
}) {
  const [expanded, setExpanded] = useState(true);

  const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count ?? 0), 0);
  const readyCount = sources.filter(s => s.status === "ready").length;
  const errorCount = sources.filter(s => s.status === "error").length;

  const realmName = (id: string) => realms.find(r => r.id === id)?.name ?? id;

  return (
    <div className="rounded-2xl border border-vc-border bg-vc-surface overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-vc-raised/30 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Agent avatar */}
        <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Bot size={16} className="text-indigo-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-vc-text truncate">{agent.name}</span>
            {agent.online ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-500/10 border border-green-300 dark:border-green-500/20 rounded-full px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-vc-muted bg-vc-raised border border-vc-ring rounded-full px-1.5 py-0.5">
                <WifiOff size={9} />
                Offline
              </span>
            )}
          </div>
          <p className="text-xs text-vc-subtle font-mono truncate mt-0.5">{agent.did}</p>
        </div>

        {/* Summary stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-vc-muted shrink-0">
          <div className="text-right">
            <div className="text-vc-text font-semibold">{sources.length}</div>
            <div>source{sources.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="text-right">
            <div className="text-vc-text font-semibold">{fmtCount(totalChunks)}</div>
            <div>chunks</div>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-1 text-red-500">
              <AlertTriangle size={13} />
              <span>{errorCount} error{errorCount > 1 ? "s" : ""}</span>
            </div>
          )}
          {readyCount === sources.length && sources.length > 0 && (
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 size={13} />
              <span>All ready</span>
            </div>
          )}
        </div>

        {/* Manage link */}
        <Link
          href={`/agents/${encodeURIComponent(agent.did)}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400 transition-colors shrink-0 ml-2"
          title="Manage on agent page"
        >
          Manage
          <ArrowUpRight size={13} />
        </Link>

        <ChevronRight
          size={16}
          className={`text-vc-subtle transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
      </div>

      {/* Sources list */}
      {expanded && (
        <div className="border-t border-vc-border/60">
          {sources.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-xs text-vc-muted">No knowledge sources configured for this agent.</p>
              <Link
                href={`/agents/${encodeURIComponent(agent.did)}`}
                className="text-xs text-indigo-500 hover:text-indigo-400 mt-1 inline-flex items-center gap-1"
              >
                Add sources on the agent page <ArrowUpRight size={11} />
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-vc-muted text-xs uppercase tracking-wider border-b border-vc-border/40 bg-vc-bg/60">
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Realm</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Chunks</th>
                  <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">Last sync</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, i) => {
                  let config: Record<string, unknown> = {};
                  try { config = JSON.parse(source.config); } catch { /**/ }
                  const urls = Array.isArray(config.urls) ? (config.urls as string[]) : [];

                  return (
                    <tr
                      key={source.id}
                      className={`border-b border-vc-border/30 last:border-0 ${i % 2 === 0 ? "" : "bg-vc-bg/40"}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <TypeIcon type={source.source_type} />
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-vc-text truncate block max-w-[180px]">{source.name}</span>
                            {source.source_type === "url" && urls.length > 0 && (
                              <span className="text-[10px] text-vc-subtle truncate block max-w-[180px]">
                                {urls[0]}{urls.length > 1 ? ` +${urls.length - 1}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="flex items-center gap-1.5 text-xs text-vc-muted">
                          <Globe2 size={11} className="shrink-0" />
                          {realmName(source.realm_id)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={source.status} />
                        {source.error && (
                          <p className="text-[10px] text-red-500 mt-0.5 max-w-[200px] truncate" title={source.error}>
                            {source.error}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-vc-muted">
                        {source.status === "ready"
                          ? <span className="text-vc-text font-medium">{fmtCount(source.chunk_count)}</span>
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-vc-muted">
                        {timeAgo(source.last_synced_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeDashboardPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading: roleLoading } = useRole();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [realms, setRealms] = useState<RealmInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isGlobalAdmin) router.replace("/");
  }, [roleLoading, isGlobalAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ksRes, agRes, rlRes] = await Promise.all([
        fetch("/api/knowledge"),
        fetch("/api/agents"),
        fetch("/api/realms"),
      ]);
      const ksData = await ksRes.json() as { sources?: KnowledgeSource[] };
      const agData = await agRes.json() as { agents?: AgentInfo[] };
      const rlData = await rlRes.json() as { realms?: RealmInfo[] };
      setSources(ksData.sources ?? []);
      setAgents(agData.agents ?? []);
      setRealms(rlData.realms ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while syncing
  useEffect(() => {
    if (!sources.some(s => s.status === "syncing")) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [sources, load]);

  if (roleLoading || !isGlobalAdmin) return null;

  // Summary stats
  const totalSources = sources.length;
  const readySources = sources.filter(s => s.status === "ready").length;
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count ?? 0), 0);
  const errorSources = sources.filter(s => s.status === "error").length;
  const agentsWithKnowledge = new Set(sources.map(s => s.agent_did)).size;

  // Agents that have at least one knowledge source, plus those that are online
  // Show all agents — those without sources show an empty state encouraging setup
  const agentsWithSources = agents.filter(a => sources.some(s => s.agent_did === a.did));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-vc-text">Knowledge Overview</h1>
            <p className="text-xs text-vc-muted">Data access map — which agents index what, and for which realm</p>
          </div>
        </div>
        {loading && <Loader2 size={16} className="animate-spin text-vc-muted" />}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total sources",    value: totalSources,        sub: "configured",        icon: <BookOpen size={16} />,     tone: "neutral" },
          { label: "Ready",            value: readySources,        sub: "indexed & live",    icon: <CheckCircle2 size={16} />, tone: readySources === totalSources && totalSources > 0 ? "ok" : "neutral" },
          { label: "Total chunks",     value: fmtCount(totalChunks), sub: "stored locally",  icon: <Database size={16} />,     tone: "neutral" },
          { label: "Agents with RAG",  value: agentsWithKnowledge, sub: "knowledge-enabled", icon: <Bot size={16} />,          tone: errorSources > 0 ? "danger" : agentsWithKnowledge > 0 ? "ok" : "neutral" },
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

      {/* Error alert */}
      {errorSources > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {errorSources} source{errorSources > 1 ? "s" : ""} failed to sync
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
              Go to the agent&apos;s Knowledge tab to retry or inspect the error.
            </p>
          </div>
        </div>
      )}

      {/* Agent cards */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-vc-muted">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : agentsWithSources.length === 0 ? (
        <div className="rounded-2xl border border-vc-border border-dashed bg-vc-surface/40 p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-vc-subtle mx-auto" />
          <p className="text-sm font-medium text-vc-text">No knowledge sources configured yet</p>
          <p className="text-xs text-vc-muted max-w-md mx-auto">
            Open any agent page, go to the <strong>Knowledge</strong> tab, and connect a URL or text source.
            Once synced, the agent will automatically use{" "}
            <code className="bg-vc-raised px-1 rounded text-indigo-400">knowledge_search</code> in conversations.
          </p>
          <Link
            href="/agents"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <Bot size={14} />
            Go to Agents
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-vc-text">
              {agentsWithSources.length} agent{agentsWithSources.length !== 1 ? "s" : ""} with knowledge sources
            </h2>
            <p className="text-xs text-vc-muted">
              Manage sources from each agent&apos;s <span className="text-vc-text">Knowledge tab</span>
            </p>
          </div>

          {agentsWithSources.map(agent => (
            <AgentKnowledgeCard
              key={agent.did}
              agent={agent}
              sources={sources.filter(s => s.agent_did === agent.did)}
              realms={realms}
            />
          ))}
        </div>
      )}

      {/* Status legend + info */}
      {agentsWithSources.length > 0 && (
        <div className="rounded-xl border border-vc-border bg-vc-surface/60 p-4 space-y-3">
          <p className="text-xs font-semibold text-vc-text">Status reference</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-vc-muted">
            <span className="flex items-center gap-1.5"><StatusDot status="idle" /> Idle — created, not yet synced</span>
            <span className="flex items-center gap-1.5"><StatusDot status="syncing" /> Syncing — agent is ingesting</span>
            <span className="flex items-center gap-1.5"><StatusDot status="ready" /> Ready — chunks indexed &amp; searchable</span>
            <span className="flex items-center gap-1.5"><StatusDot status="error" /> Error — sync failed, check agent page</span>
          </div>
          <p className="text-xs text-vc-muted pt-1 border-t border-vc-border/60">
            Data is stored <strong className="text-vc-text">locally on the agent</strong> as vector embeddings. It never leaves the agent&apos;s environment.
            To add, re-sync or remove sources, navigate to the agent and open the <strong className="text-vc-text">Knowledge</strong> tab.
          </p>
        </div>
      )}
    </div>
  );
}
