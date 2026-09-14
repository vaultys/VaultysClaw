"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActorGraph } from "./ActorGraph";
import { GraphFilterBar } from "./GraphFilterBar";
import { applyGraphFilters, DEFAULT_FILTERS, type GraphFilters } from "./actor-graph/filters";
import { graphNodeHref, type ActorGraphData } from "./actor-graph/types";

/**
 * The estate view's client half: filter state and navigation.
 *
 * Every filter but the workspace one is local — refiltering must not refetch, and it must not reset
 * the layout either, which is why `ActorGraph` diffs the data rather than remounting.
 */
export function AdminGraphView({
  data,
  workspaces,
  workspaceId,
}: {
  data: ActorGraphData;
  workspaces: { id: string; name: string }[];
  workspaceId?: string;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [colorBy, setColorBy] = useState<"kind" | "workspace">("kind");

  // Highlighting on every keystroke re-evaluates a colour accessor across every node; deferring it
  // keeps the input itself responsive on a large graph.
  const deferredSearch = useDeferredValue(search);

  const kindsPresent = useMemo(
    () =>
      [...new Set(data.nodes.filter((n) => n.nodeKind === "actor").map((n) => n.kind))].sort(),
    [data]
  );
  const filtered = useMemo(() => applyGraphFilters(data, filters), [data, filters]);

  const hidden = data.nodes.length - filtered.nodes.length;

  return (
    <div className="space-y-3">
      <GraphFilterBar
        filters={filters}
        onChange={setFilters}
        search={search}
        onSearchChange={setSearch}
        colorBy={colorBy}
        onColorByChange={setColorBy}
        workspaces={workspaces}
        workspaceId={workspaceId}
        kindsPresent={kindsPresent}
      />

      {filtered.nodes.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-xl p-10 text-center">
          <h2 className="text-sm font-semibold text-foreground mb-1">Nothing matches these filters</h2>
          <p className="text-sm text-foreground-500">
            {filters.connectedOnly
              ? "No actor in this selection has a relationship. Turn off “Connected only” to see isolated actors."
              : "Re-enable a kind or a relationship type to see something here."}
          </p>
        </div>
      ) : (
        <>
          <ActorGraph
            data={filtered}
            height={600}
            className="border border-neutral-200/60 rounded-xl overflow-hidden"
            search={deferredSearch}
            colorBy={colorBy}
            onNodeNavigate={(node) => router.push(graphNodeHref(node))}
          />
          {hidden > 0 && (
            <p className="text-xs text-foreground-400">
              {hidden} node{hidden === 1 ? "" : "s"} hidden by the current filters.
            </p>
          )}
        </>
      )}
    </div>
  );
}
