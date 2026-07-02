"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import {
  Wifi,
  WifiOff,
  Zap,
  Plus,
  List,
  Map,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { AgentsMap } from "@/components/agent/AgentsMap";
import {
  AgentsList,
  type AgentSortColumn,
  type SortDir,
} from "@/components/agent/AgentsList";
import {
  CAPABILITY_ICONS,
  AVAILABLE_CAPABILITIES,
} from "@/components/agent/capabilities";
import { adminAgentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo, ListAgentsQuery } from "@/lib/contracts";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "lastSeen:desc", label: "Last seen (newest)" },
  { value: "lastSeen:asc", label: "Last seen (oldest)" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "registeredAt:desc", label: "Registered (newest)" },
  { value: "registeredAt:asc", label: "Registered (oldest)" },
];

export default function AgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connected: wsConnected, agents: wsAgents } = useAdminWS();

  const [viewMode, setViewMode] = useState<"list" | "map">(
    searchParams.get("view") === "map" ? "map" : "list"
  );

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
  const [sortBy, setSortBy] = useState<AgentSortColumn>("lastSeen");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAgents = useCallback(async (query: ListAgentsQuery) => {
    setLoading(true);
    try {
      const data = unwrap(await adminAgentsClient.search({ query }));
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

  const handleSort = (col: AgentSortColumn) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const toggleCapability = (cap: string) => {
    setSelectedCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
    setPage(1);
  };

  const sortValue = `${sortBy}:${sortDir}`;

  useBreadcrumbs([{ label: "Agents" }], []);

  // Configure the page toolbar (title, counts, advanced search, live badge,
  // view tabs, create button)
  useToolbar(
    {
      title: "Agents",
      description: `${total} registered · ${onlineCount} online`,
      search: {
        value: search,
        onChange: (v) => {
          setSearch(v);
          setPage(1);
        },
        placeholder: "Search agents…",
        chips: [
          ...(onlineFilter
            ? [
                {
                  id: "status",
                  label: onlineFilter === "true" ? "Online" : "Offline",
                  onRemove: () => {
                    setOnlineFilter("");
                    setPage(1);
                  },
                },
              ]
            : []),
          ...selectedCapabilities.map((cap) => ({
            id: `cap-${cap}`,
            label: cap.replace(/_/g, " "),
            onRemove: () => toggleCapability(cap),
          })),
        ],
        filterGroups: [
          {
            id: "status",
            label: "Status",
            icon: <Filter className="w-3.5 h-3.5 text-primary-600" />,
            options: [
              {
                id: "online",
                label: "Online",
                active: onlineFilter === "true",
                onToggle: () => {
                  setOnlineFilter(onlineFilter === "true" ? "" : "true");
                  setPage(1);
                },
              },
              {
                id: "offline",
                label: "Offline",
                active: onlineFilter === "false",
                onToggle: () => {
                  setOnlineFilter(onlineFilter === "false" ? "" : "false");
                  setPage(1);
                },
              },
            ],
            onClear: onlineFilter
              ? () => {
                  setOnlineFilter("");
                  setPage(1);
                }
              : undefined,
          },
          {
            id: "capabilities",
            label: "Capabilities",
            icon: <Zap className="w-3.5 h-3.5 text-primary-600" />,
            options: AVAILABLE_CAPABILITIES.map((cap) => ({
              id: cap,
              label: cap.replace(/_/g, " "),
              icon: CAPABILITY_ICONS[cap],
              active: selectedCapabilities.includes(cap),
              onToggle: () => toggleCapability(cap),
            })),
            onClear:
              selectedCapabilities.length > 0
                ? () => {
                    setSelectedCapabilities([]);
                    setPage(1);
                  }
                : undefined,
          },
          {
            id: "sort",
            label: "Sort by",
            icon: <ArrowUpDown className="w-3.5 h-3.5 text-primary-600" />,
            options: SORT_OPTIONS.map((opt) => ({
              id: opt.value,
              label: opt.label,
              active: sortValue === opt.value,
              onToggle: () => {
                const [col, dir] = opt.value.split(":") as [
                  AgentSortColumn,
                  SortDir,
                ];
                setSortBy(col);
                setSortDir(dir);
                setPage(1);
              },
            })),
          },
        ],
      },
      actions: [
        {
          kind: "badge",
          id: "live",
          label: wsConnected ? "Live" : "Connecting…",
          tone: wsConnected ? "success" : "neutral",
          icon: wsConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          ),
        },
        {
          kind: "tabs",
          id: "view",
          value: viewMode,
          onChange: (v) => setViewMode(v as "list" | "map"),
          options: [
            { value: "list", label: "List", icon: <List className="w-3.5 h-3.5" /> },
            { value: "map", label: "Map", icon: <Map className="w-3.5 h-3.5" /> },
          ],
        },
        {
          kind: "button",
          id: "create",
          label: "Create agent",
          variant: "primary",
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: () => router.push("/admin/agents/create"),
        },
      ],
    },
    [
      total,
      onlineCount,
      wsConnected,
      viewMode,
      router,
      search,
      onlineFilter,
      selectedCapabilities,
      sortBy,
      sortDir,
    ]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {viewMode === "map" ? (
        <AgentsMap />
      ) : (
        <AgentsList
          agents={agents}
          loading={loading}
          total={total}
          totalPages={totalPages}
          page={page}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
          onPageChange={setPage}
          hasFilters={Boolean(search || onlineFilter)}
          onClearFilters={() => {
            setSearch("");
            setOnlineFilter("");
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
