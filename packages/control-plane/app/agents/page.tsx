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
  Search,
  X,
  Plus,
  BookOpen,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={14} />,
  internet_access: <Globe size={14} />,
  browser_control: <Monitor size={14} />,
  api_call: <Plug size={14} />,
  mail_send: <Mail size={14} />,
  code_execution: <Code size={14} />,
  system_command: <Terminal size={14} />,
  agent_communication: <BookOpen size={14} />,
};

const AVAILABLE_CAPABILITIES = Object.keys(CAPABILITY_ICONS) as Array<
  keyof typeof CAPABILITY_ICONS
>;

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

interface AgentItem {
  id: string;
  name: string;
  capabilities: string[];
  registeredAt: string;
  lastSeen: string;
  online: boolean;
  connectedAt: string | null;
  lastHeartbeat: string | null;
  realms?: {
    id: string;
    name: string;
    slug: string;
    color: string;
    isPrimary: boolean;
  }[];
  reportedLlm?: { provider: string; model: string } | null;
  tokenUsage?: { promptTokens: number; completionTokens: number } | null;
  transport?: "ws" | "peerjs" | null;
}

interface ApiResponse {
  agents: AgentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  online: number;
}

const PAGE_SIZE = 20;

export default function AgentsPage() {
  const router = useRouter();
  const { connected: wsConnected, agents: wsAgents } = useAdminWS();

  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState("");
  const [onlineFilter, setOnlineFilter] = useState<"" | "true" | "false">("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(
    []
  );
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"lastSeen" | "name" | "registeredAt">(
    "lastSeen"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [capabilitiesDropdownOpen, setCapabilitiesDropdownOpen] =
    useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAgents = useCallback(
    async (params: {
      q: string;
      online: string;
      capabilities: string[];
      page: number;
      sortBy: string;
      sortDir: string;
    }) => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({
          page: String(params.page),
          pageSize: String(PAGE_SIZE),
          sortBy: params.sortBy,
          sortDir: params.sortDir,
        });
        if (params.q) sp.set("q", params.q);
        if (params.online) sp.set("online", params.online);
        if (params.capabilities.length > 0)
          sp.set("capabilities", params.capabilities.join(","));
        const res = await fetch(`/api/agents?${sp}`);
        if (!res.ok) return;
        const data = (await res.json()) as ApiResponse;
        setAgents(data.agents);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setOnlineCount(data.online);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Re-fetch when filters/page change (debounced for q)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => {
        fetchAgents({
          q,
          online: onlineFilter,
          capabilities: selectedCapabilities,
          page,
          sortBy,
          sortDir,
        });
      },
      q ? 300 : 0
    );
  }, [
    q,
    onlineFilter,
    selectedCapabilities,
    page,
    sortBy,
    sortDir,
    fetchAgents,
  ]);

  // Refresh when WS fires an update (agents connect/disconnect)
  useEffect(() => {
    fetchAgents({
      q,
      online: onlineFilter,
      capabilities: selectedCapabilities,
      page,
      sortBy,
      sortDir,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsAgents.total, wsAgents.online]);

  const handleSort = (col: "lastSeen" | "name" | "registeredAt") => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const SortIndicator = ({ col }: { col: string }) =>
    sortBy === col ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Agents</h1>
          <p className="text-foreground-500 text-sm mt-0.5">
            {total} registered · {onlineCount} online
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
              wsConnected
                ? "bg-success-100 dark:bg-success-900/40 border-success-300 dark:border-success-700/50 text-success-700 dark:text-success-400"
                : "bg-background-200 border-neutral-200 text-foreground-400"
            }`}
          >
            {wsConnected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            {wsConnected ? "Live" : "Connecting…"}
          </span>
          <button
            onClick={() => router.push("/agents/create")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Create agent
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-2.5 text-foreground-400"
          />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or capability…"
            className="w-full pl-9 pr-8 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                setPage(1);
              }}
              className="absolute right-2.5 top-2.5 text-foreground-400 hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Online filter */}
        <select
          value={onlineFilter}
          onChange={(e) => {
            setOnlineFilter(e.target.value as "" | "true" | "false");
            setPage(1);
          }}
          className="px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All status</option>
          <option value="true">Online only</option>
          <option value="false">Offline only</option>
        </select>

        {/* Capabilities filter */}
        <div className="relative">
          <button
            onClick={() =>
              setCapabilitiesDropdownOpen(!capabilitiesDropdownOpen)
            }
            className="px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center gap-2 hover:bg-background-200 transition"
          >
            {selectedCapabilities.length > 0 ? (
              <span className="flex gap-1.5 items-center">
                <span className="text-xs">Capabilities</span>
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs bg-primary-500 text-white rounded-full">
                  {selectedCapabilities.length}
                </span>
              </span>
            ) : (
              "Capabilities"
            )}
          </button>
          {capabilitiesDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-background-200 border border-neutral-200 rounded-lg shadow-lg z-10 min-w-[200px]">
              <div className="p-2 space-y-1">
                {AVAILABLE_CAPABILITIES.map((cap) => (
                  <label
                    key={cap}
                    className="flex items-center gap-2 p-2 rounded hover:bg-background-100 cursor-pointer text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCapabilities.includes(cap)}
                      onChange={(e) => {
                        const newCaps = e.target.checked
                          ? [...selectedCapabilities, cap]
                          : selectedCapabilities.filter((c) => c !== cap);
                        setSelectedCapabilities(newCaps);
                        setPage(1);
                      }}
                      className="w-4 h-4 rounded border-neutral-200 cursor-pointer"
                    />
                    <span className="text-foreground-400">
                      {CAPABILITY_ICONS[cap]}
                    </span>
                    <span className="flex-1">{cap.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>
              {selectedCapabilities.length > 0 && (
                <div className="border-t border-neutral-200 p-2">
                  <button
                    onClick={() => {
                      setSelectedCapabilities([]);
                      setPage(1);
                    }}
                    className="w-full text-left text-xs text-primary-500 hover:text-primary-400 px-2 py-1"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sort */}
        <select
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => {
            const [col, dir] = e.target.value.split(":") as [
              typeof sortBy,
              typeof sortDir,
            ];
            setSortBy(col);
            setSortDir(dir);
            setPage(1);
          }}
          className="px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="lastSeen:desc">Last seen (newest)</option>
          <option value="lastSeen:asc">Last seen (oldest)</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="registeredAt:desc">Registered (newest)</option>
          <option value="registeredAt:asc">Registered (oldest)</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Bot className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-foreground-500 mb-1">
              {q || onlineFilter
                ? "No agents match your filters"
                : "No agents registered yet"}
            </p>
            {(q || onlineFilter) && (
              <button
                onClick={() => {
                  setQ("");
                  setOnlineFilter("");
                  setPage(1);
                }}
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
                      onClick={() => handleSort("name")}
                    >
                      Name
                      <SortIndicator col="name" />
                    </th>
                    <th className="px-5 py-3">DID</th>
                    <th className="px-5 py-3">Capabilities</th>
                    <th className="px-5 py-3">Tokens</th>
                    <th
                      className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("lastSeen")}
                    >
                      Last Seen
                      <SortIndicator col="lastSeen" />
                    </th>
                    <th
                      className="px-5 py-3 cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("registeredAt")}
                    >
                      Registered
                      <SortIndicator col="registeredAt" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className="hover:bg-background-200/40 transition-colors cursor-pointer"
                      onClick={() =>
                        router.push(`/agents/${encodeURIComponent(agent.id)}`)
                      }
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          {agent.online ? (
                            <span className="flex items-center gap-1.5 text-success-600 dark:text-success-400 text-xs">
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
                                  ? "bg-secondary-100 dark:bg-secondary-500/15 text-secondary-700 dark:text-secondary-400 border-secondary-300 dark:border-secondary-500/30"
                                  : "bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-400 border-primary-300 dark:border-primary-500/30"
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
                      <td className="px-5 py-3.5 text-foreground-500 font-mono text-xs">
                        <span title={agent.id}>{shortDid(agent.id)}</span>
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
                          ? timeAgo(agent.lastHeartbeat)
                          : timeAgo(agent.lastSeen)}
                      </td>
                      <td className="px-5 py-3.5 text-foreground-500 text-xs">
                        {timeAgo(agent.registeredAt)}
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  // Show pages around current
                  const half = 3;
                  let start = Math.max(1, page - half);
                  const end = Math.min(totalPages, start + 6);
                  start = Math.max(1, end - 6);
                  return start + i;
                })
                  .filter((p) => p >= 1 && p <= totalPages)
                  .map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
    </div>
  );
}
