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
        <div className="border border-warning-200 bg-warning-50 rounded-xl px-4 py-3 text-sm text-warning-800">
          Showing {ESTATE_NODE_CAP.toLocaleString()} of {data.totalActors.toLocaleString()} actors —
          connected ones first, then the most recently registered. Narrow by workspace to see a
          complete picture of one part of the estate.
        </div>
      )}

      {data.nodes.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-xl p-10 text-center">
          <h2 className="text-sm font-semibold text-foreground mb-1">No relationships recorded yet</h2>
          <p className="text-sm text-foreground-500">
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
