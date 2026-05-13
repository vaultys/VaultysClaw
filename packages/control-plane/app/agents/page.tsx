"use client";

import { useRouter } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import {
  Bot,
  Wifi,
  WifiOff,
  CircleDot,
  Circle,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Terminal,
  Zap,
} from "lucide-react";

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={14} />,
  internet_access: <Globe size={14} />,
  browser_control: <Monitor size={14} />,
  api_call: <Plug size={14} />,
  mail_send: <Mail size={14} />,
  code_execution: <Code size={14} />,
  system_command: <Terminal size={14} />,
};

const PAGE_SIZE = 10;

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `did:…${did.slice(-8)}`;
}

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

import { useState } from "react";

export default function AgentsPage() {
  const router = useRouter();
  const { agents: agentsState, connected: wsConnected } = useAdminWS();
  const agents = agentsState.agents;
  const total = agentsState.total;
  const onlineCount = agentsState.online;

  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(agents.length / PAGE_SIZE));
  const paginated = agents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-vc-text">Agents</h1>
          <p className="text-vc-muted text-sm mt-0.5">
            {total} registered · {onlineCount} online
          </p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${wsConnected
          ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700/50 text-green-700 dark:text-green-400"
          : "bg-vc-raised border-vc-border text-vc-subtle"
          }`}>
          {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {wsConnected ? "Live" : "Connecting…"}
        </span>
      </div>

      {/* WS warning */}
      {!wsConnected && (
        <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700/50 rounded-xl px-4 py-3 text-yellow-700 dark:text-yellow-300 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          Connecting to server…
        </div>
      )}

      {/* Agent table */}
      <div className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
        {agents.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vc-border text-left text-xs font-medium text-vc-subtle uppercase tracking-wider">
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">DID</th>
                    <th className="px-5 py-3">Capabilities</th>
                    <th className="px-5 py-3">Tokens</th>
                    <th className="px-5 py-3">Last Seen</th>
                    <th className="px-5 py-3">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vc-border">
                  {paginated.map((agent) => (
                    <tr
                      key={agent.id}
                      className="hover:bg-vc-raised/40 transition-colors cursor-pointer"
                      onClick={() => router.push(`/agents/${encodeURIComponent(agent.id)}`)}
                    >
                      <td className="px-5 py-3.5">
                        {agent.online ? (
                          <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs">
                            <CircleDot className="w-3.5 h-3.5" /> Online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-vc-subtle text-xs">
                            <Circle className="w-3.5 h-3.5" /> Offline
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-vc-text">
                        <div className="flex flex-col gap-1">
                          <span>{agent.name}</span>
                          {agent.realms && agent.realms.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {agent.realms.map((r) => (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-normal"
                                  style={{
                                    backgroundColor: r.color + "22",
                                    color: r.color,
                                    border: `1px solid ${r.color}44`,
                                  }}
                                >
                                  {r.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-vc-muted font-mono text-xs">
                        <span title={agent.id}>{shortDid(agent.id)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {agent.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="relative group bg-vc-raised border border-vc-ring p-1 rounded text-vc-text-2 flex items-center justify-center"
                            >
                              {CAPABILITY_ICONS[cap] ?? <Zap size={14} />}
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] text-white bg-gray-900 rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                                {cap.replace(/_/g, " ")}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-vc-muted text-xs">
                        {agent.tokenUsage ? (
                          <span title={`Prompt: ${agent.tokenUsage.promptTokens.toLocaleString()}, Completion: ${agent.tokenUsage.completionTokens.toLocaleString()}`}>
                            {(agent.tokenUsage.promptTokens + agent.tokenUsage.completionTokens).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-vc-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-vc-muted text-xs">
                        {agent.online ? timeAgo(agent.lastHeartbeat) : timeAgo(agent.lastSeen)}
                      </td>
                      <td className="px-5 py-3.5 text-vc-muted text-xs">{timeAgo(agent.registeredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-vc-border">
                <p className="text-xs text-vc-subtle">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, agents.length)} of {agents.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-vc-muted hover:text-vc-text hover:bg-vc-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${p === page
                        ? "bg-indigo-600 text-white"
                        : "text-vc-muted hover:text-vc-text hover:bg-vc-raised"
                        }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-vc-muted hover:text-vc-text hover:bg-vc-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-5 py-16 text-center">
            <Bot className="w-10 h-10 text-vc-ring mx-auto mb-3" />
            <p className="text-vc-muted mb-1">No agents registered yet</p>
            <p className="text-vc-subtle text-sm max-w-sm mx-auto">
              Agents register automatically when they connect via WebSocket and complete VaultysID authentication.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
