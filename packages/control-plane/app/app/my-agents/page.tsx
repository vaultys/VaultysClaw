"use client";
import { useRouter } from "next/navigation";
import { Filter, Zap, ArrowUpDown } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  AgentsList,
  type AgentSortColumn,
  type SortDir,
} from "@/components/agent/AgentsList";
import {
  CAPABILITY_ICONS,
  AVAILABLE_CAPABILITIES,
} from "@/components/agent/capabilities";
import { agentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo, ListAgentsQuery } from "@/lib/contracts";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "lastSeen:desc", label: "Last seen (newest)" },
  { value: "lastSeen:asc", label: "Last seen (oldest)" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "registeredAt:desc", label: "Registered (newest)" },
  { value: "registeredAt:asc", label: "Registered (oldest)" },
];

/**
 * "My Agents" — the member-facing agents list. Unlike the admin agents page,
 * it scopes to the caller's own workspaces (via `mine=true`) for every role,
 * has no map view, no "create agent" action and no admin WebSocket.
 */
export default function MyAgentsPage() {
  const router = useRouter();

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
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
      const data = unwrap(await agentsClient.search({ query }));
      setAgents(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when filters/page change (debounced for the search box)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => {
        fetchAgents({
          mine: "true",
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

  useBreadcrumbs([{ label: "My Agents" }], []);

  useToolbar(
    {
      title: "My Agents",
      description: `${total} agent${total === 1 ? "" : "s"} in your workspaces`,
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
    },
    [
      total,
      search,
      onlineFilter,
      selectedCapabilities,
      sortBy,
      sortDir,
    ]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
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
        detailBasePath="/app/my-agents"
        hasFilters={Boolean(search || onlineFilter)}
        onClearFilters={() => {
          setSearch("");
          setOnlineFilter("");
          setPage(1);
        }}
      />
    </div>
  );
}
