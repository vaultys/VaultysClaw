"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Bot,
  Globe2,
  AlertTriangle,
  ChevronRight,
  WifiOff,
  ArrowUpRight,
} from "lucide-react";
import { timeAgo, formatCompactNumber } from "@vaultysclaw/shared";
import { AgentInfo, KnowledgeSource, WorkspaceWithCounts } from "@/lib/contracts";
import { StatusBadge, TypeIcon } from "./KnowledgeStatus";
import { JsonObject } from "@prisma/client/runtime/client";

export function AgentKnowledgeCard({
  agent,
  sources,
  workspaces,
}: {
  agent: AgentInfo;
  sources: KnowledgeSource[];
  workspaces: WorkspaceWithCounts[];
}) {
  const [expanded, setExpanded] = useState(true);

  const totalChunks = sources.reduce((sum, s) => sum + (s.chunkCount ?? 0), 0);
  const readyCount = sources.filter((s) => s.status === "ready").length;
  const errorCount = sources.filter((s) => s.status === "error").length;

  const workspaceName = (id: string) => workspaces.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-background-100 overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background-200/30 transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Agent avatar */}
        <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-500/30 flex items-center justify-center shrink-0">
          <Bot size={16} className="text-primary-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {agent.name}
            </span>
            {agent.online ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success-700 bg-success-100 border border-success-300 rounded-full px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse" />
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-1.5 py-0.5">
                <WifiOff size={9} />
                Offline
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-400 font-mono truncate mt-0.5">
            {agent.did}
          </p>
        </div>

        {/* Summary stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-foreground-500 shrink-0">
          <div className="text-right">
            <div className="text-foreground font-semibold">
              {sources.length}
            </div>
            <div>source{sources.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="text-right">
            <div className="text-foreground font-semibold">
              {formatCompactNumber(totalChunks)}
            </div>
            <div>chunks</div>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-1 text-danger-500">
              <AlertTriangle size={13} />
              <span>
                {errorCount} error{errorCount > 1 ? "s" : ""}
              </span>
            </div>
          )}
          {readyCount === sources.length && sources.length > 0 && (
            <div className="flex items-center gap-1 text-success-600">
              <CheckCircle2 size={13} />
              <span>All ready</span>
            </div>
          )}
        </div>

        {/* Manage link */}
        <Link
          href={`/agents/${encodeURIComponent(agent.did)}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-400 transition-colors shrink-0 ml-2"
          title="Manage on agent page"
        >
          Manage
          <ArrowUpRight size={13} />
        </Link>

        <ChevronRight
          size={16}
          className={`text-foreground-400 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
      </div>

      {/* Sources list */}
      {expanded && (
        <div className="border-t border-neutral-200/60">
          {sources.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-xs text-foreground-500">
                No knowledge sources configured for this agent.
              </p>
              <Link
                href={`/agents/${encodeURIComponent(agent.did)}`}
                className="text-xs text-primary-500 hover:text-primary-400 mt-1 inline-flex items-center gap-1"
              >
                Add sources on the agent page <ArrowUpRight size={11} />
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-foreground-500 text-xs uppercase tracking-wider border-b border-neutral-200/40 bg-background/60">
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">
                    Workspace
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">
                    Chunks
                  </th>
                  <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">
                    Last sync
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, i) => {
                  const urls = Array.isArray(
                    (source.config as JsonObject)?.urls
                  )
                    ? ((source.config as JsonObject).urls as string[])
                    : [];

                  return (
                    <tr
                      key={source.id}
                      className={`border-b border-neutral-200/30 last:border-0 ${i % 2 === 0 ? "" : "bg-background/40"}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <TypeIcon type={source.sourceType} />
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-foreground truncate block max-w-[180px]">
                              {source.name}
                            </span>
                            {source.sourceType === "url" && urls.length > 0 && (
                              <span className="text-[10px] text-foreground-400 truncate block max-w-[180px]">
                                {urls[0]}
                                {urls.length > 1 ? ` +${urls.length - 1}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                          <Globe2 size={11} className="shrink-0" />
                          {workspaceName(source.workspaceId)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={source.status} />
                        {source.error && (
                          <p
                            className="text-[10px] text-danger-500 mt-0.5 max-w-[200px] truncate"
                            title={source.error}
                          >
                            {source.error}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-foreground-500">
                        {source.status === "ready" ? (
                          <span className="text-foreground font-medium">
                            {formatCompactNumber(source.chunkCount)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-foreground-500">
                        {timeAgo(source.lastSyncedAt?.toString() ?? "")}
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
