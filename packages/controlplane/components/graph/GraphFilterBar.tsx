"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ACTOR_KIND_META } from "@/lib/actor-kinds";
import { EDGE_KINDS, EDGE_KIND_LABEL, type ActorGraphEdgeKind } from "./actor-graph/types";
import type { GraphFilters } from "./actor-graph/filters";

const CHIP = "px-2.5 py-1 rounded-full border text-xs transition-colors";
const CHIP_ON = "bg-primary-100 border-primary-200 text-primary-700";
const CHIP_OFF = "bg-background-100 border-neutral-200 text-foreground-500 hover:text-foreground";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function GraphFilterBar({
  filters,
  onChange,
  search,
  onSearchChange,
  colorBy,
  onColorByChange,
  workspaces,
  workspaceId,
  kindsPresent,
}: {
  filters: GraphFilters;
  onChange: (next: GraphFilters) => void;
  search: string;
  onSearchChange: (next: string) => void;
  colorBy: "kind" | "workspace";
  onColorByChange: (next: "kind" | "workspace") => void;
  workspaces: { id: string; name: string }[];
  workspaceId?: string;
  /** Only the kinds actually present get a chip — an estate with no proxies has no reason to offer
   *  a proxy filter, and `Actor.kind` is open-ended so a hardcoded list would go stale. */
  kindsPresent: string[];
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-400 pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Find by name or DID"
          aria-label="Find an actor in the graph"
          className="pl-7 pr-2 py-1 w-56 text-xs bg-background-100 border border-neutral-200 rounded-lg text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-400"
        />
      </div>

      {/* The one filter that runs server-side: narrowing in SQL is what actually shrinks the
          payload, so it is a navigation rather than local state. */}
      <select
        value={workspaceId ?? ""}
        onChange={(e) =>
          router.push(e.target.value ? `/admin/graph?workspace=${e.target.value}` : "/admin/graph")
        }
        aria-label="Workspace"
        className="py-1 px-2 text-xs bg-background-100 border border-neutral-200 rounded-lg text-foreground"
      >
        <option value="">All workspaces</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center gap-1.5">
        {kindsPresent.map((kind) => {
          const on = filters.kinds.length === 0 || filters.kinds.includes(kind);
          return (
            <button
              key={kind}
              onClick={() => {
                // An empty list means "everything", so the first click has to start from the full
                // set — otherwise clicking one kind off would read as selecting only that kind.
                const base = filters.kinds.length === 0 ? kindsPresent : filters.kinds;
                const next = toggle(base, kind);
                onChange({ ...filters, kinds: next.length === kindsPresent.length ? [] : next });
              }}
              className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              {ACTOR_KIND_META[kind]?.label ?? kind}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        {EDGE_KINDS.map((edge: ActorGraphEdgeKind) => {
          const on = filters.edgeKinds.includes(edge);
          return (
            <button
              key={edge}
              onClick={() => onChange({ ...filters, edgeKinds: toggle(filters.edgeKinds, edge) })}
              className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              {EDGE_KIND_LABEL[edge]}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-foreground-500">
        <input
          type="checkbox"
          checked={filters.connectedOnly}
          onChange={(e) => onChange({ ...filters, connectedOnly: e.target.checked })}
          className="accent-primary-600"
        />
        Connected only
      </label>

      <label className="flex items-center gap-1.5 text-xs text-foreground-500">
        <input
          type="checkbox"
          checked={colorBy === "workspace"}
          onChange={(e) => onColorByChange(e.target.checked ? "workspace" : "kind")}
          className="accent-primary-600"
        />
        Colour by workspace
      </label>
    </div>
  );
}
