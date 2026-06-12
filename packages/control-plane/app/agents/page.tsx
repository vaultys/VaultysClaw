"use client";
import { useRouter, useSearchParams } from "next/navigation";
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
  Plus,
  BookOpen,
  List,
  Map,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/map/WorldMap";
import { SearchBar } from "@/components/shared";
import { agentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo, ListAgentsQuery } from "@/lib/contracts";
import { shortDid, timeAgo } from "@vaultysclaw/shared";

const WorldMap = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);

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

const PAGE_SIZE = 20;

export default function AgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connected: wsConnected, agents: wsAgents } = useAdminWS();

  const [viewMode, setViewMode] = useState<"list" | "map">(
    searchParams.get("view") === "map" ? "map" : "list"
  );
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
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

  const fetchAgents = useCallback(async (query: ListAgentsQuery) => {
    setLoading(true);
    try {
      const data = unwrap(await agentsClient.search({ query }));
      setAgents(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setOnlineCount(data.items.filter((a) => a.online).length);
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch map markers whenever map view is active
  const fetchMapMarkers = useCallback(async () => {
    setMapLoading(true);
    try {
      const res = await fetch("/api/map");
      if (!res.ok) return;
      const data = (await res.json()) as { markers?: MapMarker[] };
      setMapMarkers((data.markers ?? []).filter((m) => m.type === "agent"));
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "map") fetchMapMarkers();
  }, [viewMode, fetchMapMarkers]);

  // Re-fetch when filters/page change (debounced for q)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => {
        fetchAgents({
          search,
          online: onlineFilter || undefined,
          capabilities:
            selectedCapabilities.length > 0
              ? selectedCapabilities.join(",")
              : undefined,
          page,
          sortBy,
          sortDir,
        });
      },
      search ? 300 : 0
    );
  }, [
    search,
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
      search,
      online: onlineFilter || undefined,
      capabilities:
        selectedCapabilities.length > 0
          ? selectedCapabilities.join(",")
          : undefined,
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
                ? "bg-success-100 border-success-300 text-success-700"
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
          {/* View toggle */}
          <div className="flex items-center bg-background-100 border border-neutral-200 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground-500 hover:text-foreground"
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "map"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground-500 hover:text-foreground"
              }`}
            >
              <Map className="w-3.5 h-3.5" /> Map
            </button>
          </div>
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
        <SearchBar
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search by name"
        />

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

      {/* Map view */}
      {viewMode === "map" && (
        <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-semibold text-foreground">
                Agent Locations
              </span>
              <span className="text-xs text-foreground-500 bg-background-200 rounded-full px-2 py-0.5">
                {mapMarkers.length} located
              </span>
            </div>
            <button
              onClick={fetchMapMarkers}
              className="text-xs text-foreground-500 hover:text-foreground"
            >
              Refresh
            </button>
          </div>
          {mapLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mapMarkers.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Globe className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-foreground-500 text-sm">
                No agents have a location set yet.
              </p>
              <p className="text-foreground-400 text-xs mt-1">
                Agents are auto-located when they connect, or you can set a
                location manually in each agent&apos;s settings.
              </p>
            </div>
          ) : (
            <WorldMap
              markers={mapMarkers}
              height={480}
              onMarkerClick={(m) =>
                router.push(`/agents/${encodeURIComponent(m.id)}`)
              }
            />
          )}
        </div>
      )}

      {/* Table */}
      {viewMode === "list" && (
        <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : agents.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Bot className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-foreground-500 mb-1">
                {search || onlineFilter
                  ? "No agents match your filters"
                  : "No agents registered yet"}
              </p>
              {(search || onlineFilter) && (
                <button
                  onClick={() => {
                    setSearch("");
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
                        key={agent.did}
                        className="hover:bg-background-200/40 transition-colors cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/agents/${encodeURIComponent(agent.did)}`
                          )
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
                            {agent.agentRealms &&
                              agent.agentRealms.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {agent.agentRealms.map((r) => (
                                    <span
                                      key={r.realmId}
                                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-normal"
                                      style={{
                                        backgroundColor: r.realm.color + "22",
                                        color: r.realm.color,
                                        border: `1px solid ${r.realm.color}44`,
                                      }}
                                    >
                                      {r.realm.name}
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
      )}
    </div>
  );
}
