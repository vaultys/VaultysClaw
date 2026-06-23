"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  Bot,
  AlertTriangle,
  Wifi,
  Database,
} from "lucide-react";
import { formatCompactNumber } from "@vaultysclaw/shared";
import { useRole } from "@/hooks/useRole";
import {
  agentsClient,
  knowledgeClient,
  realmsClient,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { AgentInfo, KnowledgeSource, RealmWithCounts } from "@/lib/contracts";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  DoclingConfigPanel,
  StorageConfigPanel,
  AgentKnowledgeCard,
  StatusDot,
} from "@/components/knowledge";

export default function KnowledgeDashboardPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading: roleLoading } = useRole();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [realms, setRealms] = useState<RealmWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isGlobalAdmin) router.replace("/");
  }, [roleLoading, isGlobalAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ksRes, agRes, rlRes] = await Promise.all([
        knowledgeClient.list(),
        agentsClient.search(),
        realmsClient.list(),
      ]);
      const agData = unwrap(agRes);
      const rlData = unwrap(rlRes);

      setSources(unwrap(ksRes).sources as unknown as KnowledgeSource[]);
      setAgents(agData.items);
      setRealms(rlData.realms ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while syncing
  useEffect(() => {
    if (!sources.some((s) => s.status === "syncing")) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [sources, load]);

  const syncing = sources.some((s) => s.status === "syncing");
  const errorCount = sources.filter((s) => s.status === "error").length;
  const agentsWithKnowledge = new Set(sources.map((s) => s.agentDid)).size;

  useBreadcrumbs([{ label: "Knowledge" }], []);

  useToolbar(
    {
      title: "Knowledge Overview",
      description: loading
        ? "Data access map — which agents index what, and for which realm"
        : `${sources.length} source${sources.length !== 1 ? "s" : ""} · ${agentsWithKnowledge} agent${agentsWithKnowledge !== 1 ? "s" : ""} with RAG`,
      actions: [
        syncing
          ? {
              kind: "badge" as const,
              id: "syncing",
              label: "Syncing",
              tone: "warning" as const,
              icon: <Loader2 className="w-3 h-3 animate-spin" />,
            }
          : errorCount > 0
            ? {
                kind: "badge" as const,
                id: "errors",
                label: `${errorCount} error${errorCount > 1 ? "s" : ""}`,
                tone: "danger" as const,
                icon: <AlertTriangle className="w-3 h-3" />,
              }
            : {
                kind: "badge" as const,
                id: "live",
                label: "Live",
                tone: "success" as const,
                icon: <Wifi className="w-3 h-3" />,
              },
        {
          kind: "button" as const,
          id: "refresh",
          label: "Refresh",
          variant: "default" as const,
          icon: (
            <Loader2
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          ),
          onClick: () => load(),
        },
      ],
    },
    [loading, sources, syncing, errorCount, agentsWithKnowledge, load]
  );

  if (roleLoading || !isGlobalAdmin) return null;

  // Summary stats
  const totalSources = sources.length;
  const readySources = sources.filter((s) => s.status === "ready").length;
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunkCount ?? 0), 0);
  const errorSources = errorCount;

  // Agents that have at least one knowledge source.
  const agentsWithSources = agents.filter((a) =>
    sources.some((s) => s.agentDid === a.did)
  );

  return (
    <div className="p-6 w-full max-w-5xl mx-auto space-y-6">
      {/* Docling config */}
      <DoclingConfigPanel />

      {/* Storage config */}
      <StorageConfigPanel />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Total sources",
            value: totalSources,
            sub: "configured",
            icon: <BookOpen size={16} />,
            tone: "neutral",
          },
          {
            label: "Ready",
            value: readySources,
            sub: "indexed & live",
            icon: <CheckCircle2 size={16} />,
            tone:
              readySources === totalSources && totalSources > 0
                ? "ok"
                : "neutral",
          },
          {
            label: "Total chunks",
            value: formatCompactNumber(totalChunks),
            sub: "stored locally",
            icon: <Database size={16} />,
            tone: "neutral",
          },
          {
            label: "Agents with RAG",
            value: agentsWithKnowledge,
            sub: "knowledge-enabled",
            icon: <Bot size={16} />,
            tone:
              errorSources > 0
                ? "danger"
                : agentsWithKnowledge > 0
                  ? "ok"
                  : "neutral",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
                {card.label}
              </span>
              <span
                className={
                  card.tone === "ok"
                    ? "text-success-500"
                    : card.tone === "danger"
                      ? "text-danger-500"
                      : "text-primary-500"
                }
              >
                {card.icon}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            {card.sub && (
              <p className="text-xs text-foreground-400">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Error alert */}
      {errorSources > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-danger-50 border border-danger-200">
          <AlertTriangle
            size={16}
            className="text-danger-500 mt-0.5 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-danger-700">
              {errorSources} source{errorSources > 1 ? "s" : ""} failed to sync
            </p>
            <p className="text-xs text-danger-600/80 mt-0.5">
              Go to the agent&apos;s Knowledge tab to retry or inspect the
              error.
            </p>
          </div>
        </div>
      )}

      {/* Agent cards */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : agentsWithSources.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 border-dashed bg-background-100/40 p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-foreground-400 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            No knowledge sources configured yet
          </p>
          <p className="text-xs text-foreground-500 max-w-md mx-auto">
            Open any agent page, go to the <strong>Knowledge</strong> tab, and
            connect a URL or text source. Once synced, the agent will
            automatically use{" "}
            <code className="bg-background-200 px-1 rounded text-primary-400">
              knowledge_search
            </code>{" "}
            in conversations.
          </p>
          <Link
            href="/agents"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            <Bot size={14} />
            Go to Agents
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {agentsWithSources.length} agent
              {agentsWithSources.length !== 1 ? "s" : ""} with knowledge sources
            </h2>
            <p className="text-xs text-foreground-500">
              Manage sources from each agent&apos;s{" "}
              <span className="text-foreground">Knowledge tab</span>
            </p>
          </div>

          {agentsWithSources.map((agent) => (
            <AgentKnowledgeCard
              key={agent.did}
              agent={agent}
              sources={sources.filter((s) => s.agentDid === agent.did)}
              realms={realms}
            />
          ))}
        </div>
      )}

      {/* Status legend + info */}
      {agentsWithSources.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-background-100/60 p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">
            Status reference
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-foreground-500">
            <span className="flex items-center gap-1.5">
              <StatusDot status="idle" /> Idle — created, not yet synced
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot status="syncing" /> Syncing — agent is ingesting
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot status="ready" /> Ready — chunks indexed &amp;
              searchable
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot status="error" /> Error — sync failed, check agent page
            </span>
          </div>
          <p className="text-xs text-foreground-500 pt-1 border-t border-neutral-200/60">
            Data is stored{" "}
            <strong className="text-foreground">locally on the agent</strong> as
            vector embeddings. It never leaves the agent&apos;s environment. To
            add, re-sync or remove sources, navigate to the agent and open the{" "}
            <strong className="text-foreground">Knowledge</strong> tab.
          </p>
        </div>
      )}
    </div>
  );
}
