import PageChrome from "@/components/layout/PageChrome";
import { AdminGraphView } from "@/components/graph/AdminGraphView";
import { buildEstateGraph } from "@/lib/actor-graph";
import { ESTATE_NODE_CAP } from "@/components/graph/actor-graph/types";
import { WorkspaceDAO } from "@/db";

/**
 * The relationship graph: every Actor as a node, and the three relationships the schema already
 * records as edges — `Actor.ownerDid`, `ActorLink`, and workspace membership (drawn through a hub
 * node, since an edge needs two ends).
 *
 * Read-only. Ownership and links are still edited from an Actor's own page; this is the view that
 * answers "what does the estate actually look like", which a list of one actor at a time cannot.
 */
export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { workspace: workspaceId } = await searchParams;
  const [data, workspaces] = await Promise.all([
    buildEstateGraph({ workspaceId }),
    WorkspaceDAO.list(),
  ]);

  const actorCount = data.nodes.filter((n) => n.nodeKind === "actor").length;
  const relationshipCount = data.links.filter((l) => l.edgeKind !== "workspace").length;

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{
          title: "Graph",
          description: `${actorCount} actor${actorCount === 1 ? "" : "s"}, ${relationshipCount} relationship${relationshipCount === 1 ? "" : "s"}`,
        }}
        breadcrumbs={[{ label: "Graph" }]}
      />

      {data.truncated && (
        <div className="flex gap-2.5 rounded-lg border border-neutral-200/60 bg-background-100 px-4 py-3 text-sm text-foreground-600">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-500" />
          <p>
            Showing{" "}
            <span className="font-mono tabular-nums">{ESTATE_NODE_CAP.toLocaleString()}</span> of{" "}
            <span className="font-mono tabular-nums">{data.totalActors.toLocaleString()}</span>{" "}
            actors — connected ones first, then the most recently registered. Narrow by workspace to
            see a complete picture of one part of the estate.
          </p>
        </div>
      )}

      {data.nodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
          <h2 className="font-medium text-foreground mb-1">No relationships recorded yet</h2>
          <p>
            Set an owner, or add a link, from any Actor&apos;s detail page — the Relationships tab —
            and the graph fills in from there.
          </p>
        </div>
      ) : (
        <AdminGraphView
          data={data}
          workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}
