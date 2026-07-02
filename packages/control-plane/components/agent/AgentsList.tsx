"use client";

import { useRouter } from "next/navigation";
import {
  Bot,
  CircleDot,
  Circle,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { AgentInfo } from "@/lib/contracts";
import { shortDid, timeAgo } from "@vaultysclaw/shared";
import { CAPABILITY_ICONS } from "./capabilities";

export type AgentSortColumn = "lastSeen" | "name" | "registeredAt";
export type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

interface AgentsListProps {
  agents: AgentInfo[];
  loading: boolean;
  total: number;
  totalPages: number;
  page: number;
  sortBy: AgentSortColumn;
  sortDir: SortDir;
  onSort: (col: AgentSortColumn) => void;
  onPageChange: (page: number) => void;
  /** Whether any filter/search is active (affects the empty state copy). */
  hasFilters: boolean;
  onClearFilters: () => void;
}

/**
 * Table (list) view of the agents page. Presentational: the parent owns the
 * data, filters, sorting and pagination state (driven by the toolbar) and
 * passes them in; this component renders the table and reports interactions.
 */
export function AgentsList({
  agents,
  loading,
  total,
  totalPages,
  page,
  sortBy,
  sortDir,
  onSort,
  onPageChange,
  hasFilters,
  onClearFilters,
}: AgentsListProps) {
  const router = useRouter();

  const SortIndicator = ({ col }: { col: string }) =>
    sortBy === col ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  return (
    <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <Bot className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-foreground-500 mb-1">
            {hasFilters
              ? "No agents match your filters"
              : "No agents registered yet"}
          </p>
          {hasFilters && (
            <button
              onClick={onClearFilters}
              className="text-primary-500 text-sm mt-1 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
                  <th className="px-5 py-3">Status</th>
                  <th
                    className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
                    onClick={() => onSort("name")}
                  >
                    Name
                    <SortIndicator col="name" />
                  </th>
                  <th className="px-5 py-3">DID</th>
                  <th className="px-5 py-3">Capabilities</th>
                  <th className="px-5 py-3">Tokens</th>
                  <th
                    className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
                    onClick={() => onSort("lastSeen")}
                  >
                    Last Seen
                    <SortIndicator col="lastSeen" />
                  </th>
                  <th
                    className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
                    onClick={() => onSort("registeredAt")}
                  >
                    Registered
                    <SortIndicator col="registeredAt" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {agents.map((agent) => (
                  <tr
                    key={agent.did}
                    className="hover:bg-background-200/40 transition-colors cursor-pointer"
                    onClick={() =>
                      router.push(`/admin/agents/${encodeURIComponent(agent.did)}`)
                    }
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        {agent.online ? (
                          <span className="flex items-center gap-1.5 text-success-600 text-xs">
                            <CircleDot className="w-3.5 h-3.5" /> Online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-foreground-400 text-xs">
                            <Circle className="w-3.5 h-3.5" /> Offline
                          </span>
                        )}
                        {agent.online && agent.transport && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                              agent.transport === "peerjs"
                                ? "bg-secondary-100 text-secondary-700 border-secondary-300"
                                : "bg-primary-100 text-primary-700 border-primary-300"
                            }`}
                          >
                            {agent.transport === "peerjs"
                              ? "WebRTC"
                              : "WebSocket"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      <div className="flex flex-col gap-1">
                        <span>{agent.name}</span>
                        {agent.agentWorkspaces && agent.agentWorkspaces.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {agent.agentWorkspaces.map((r) => (
                              <span
                                key={r.workspaceId}
                                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-normal"
                                style={{
                                  backgroundColor: r.workspace.color + "22",
                                  color: r.workspace.color,
                                  border: `1px solid ${r.workspace.color}44`,
                                }}
                              >
                                {r.workspace.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-foreground-500 font-mono text-xs">
                      <span title={agent.did}>{shortDid(agent.did)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {agent.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="relative group bg-background-200 border border-neutral-300 p-1 rounded text-foreground-700 flex items-center justify-center"
                          >
                            {CAPABILITY_ICONS[cap] ?? <Zap size={14} />}
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] text-white bg-neutral-900 rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                              {cap.replace(/_/g, " ")}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-foreground-500 text-xs">
                      {agent.tokenUsage ? (
                        <span
                          title={`Prompt: ${agent.tokenUsage.promptTokens.toLocaleString()}, Completion: ${agent.tokenUsage.completionTokens.toLocaleString()}`}
                        >
                          {(
                            agent.tokenUsage.promptTokens +
                            agent.tokenUsage.completionTokens
                          ).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-foreground-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-foreground-500 text-xs">
                      {agent.online
                        ? timeAgo(agent.lastHeartbeat?.toString() ?? null)
                        : timeAgo(agent.lastSeen?.toString() ?? null)}
                    </td>
                    <td className="px-5 py-3.5 text-foreground-500 text-xs">
                      {timeAgo(agent.registeredAt?.toString() ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200">
            <p className="text-xs text-foreground-400">
              {total === 0
                ? "0 results"
                : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                // Show pages around current
                let start = Math.max(1, page - 3);
                const end = Math.min(totalPages, start + 6);
                start = Math.max(1, end - 6);
                return start + i;
              })
                .filter((p) => p >= 1 && p <= totalPages)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-primary-600 text-white"
                        : "text-foreground-500 hover:text-foreground hover:bg-background-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
