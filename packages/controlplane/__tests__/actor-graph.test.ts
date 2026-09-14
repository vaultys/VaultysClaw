/**
 * The relationship graph's pure half.
 *
 * Everything asserted here runs with no database and no WebGL: `assembleActorGraph` turns rows into
 * `{nodes, links}`, `egoSubgraph` cuts a neighbourhood out of it, and `applyGraphFilters` is what
 * the client toggles run through. The properties worth pinning are the ones that produce a *wrong
 * picture* rather than a crash — a dangling edge, a hub that swallows the view, a node left
 * floating after its only edge was filtered away.
 */
import { describe, it, expect } from "vitest";
import {
  assembleActorGraph,
  workspaceNodeId,
  type GraphActorInput,
  type GraphLinkInput,
  type GraphWorkspaceInput,
} from "@/lib/actor-graph";
import { egoSubgraph } from "@/components/graph/actor-graph/ego";
import { applyGraphFilters, DEFAULT_FILTERS } from "@/components/graph/actor-graph/filters";
import { KIND_TOKEN } from "@/components/graph/actor-graph/colors";
import { ACTOR_KIND_META } from "@/lib/actor-kinds";

const T0 = new Date("2026-01-01T00:00:00Z");

function actor(did: string, over: Partial<GraphActorInput> = {}): GraphActorInput {
  return {
    did,
    name: did.toUpperCase(),
    kind: "openclaw",
    workspaceId: null,
    ownerDid: null,
    registeredAt: T0,
    ...over,
  };
}
const link = (id: string, fromDid: string, toDid: string, label = "manages"): GraphLinkInput => ({
  id,
  fromDid,
  toDid,
  label,
});
const workspace = (id: string): GraphWorkspaceInput => ({ id, name: `WS ${id}`, color: "#123456" });

describe("assembleActorGraph", () => {
  it("produces one edge per relationship kind", () => {
    const graph = assembleActorGraph(
      [
        actor("alice", { kind: "human" }),
        actor("laptop", { kind: "device", ownerDid: "alice", workspaceId: "w1" }),
      ],
      [link("l1", "laptop", "alice", "reports to")],
      [workspace("w1")],
      { workspaceNodes: true }
    );

    expect(graph.links.map((l) => l.edgeKind).sort()).toEqual(["link", "ownership", "workspace"]);
    expect(graph.links.find((l) => l.edgeKind === "ownership")).toMatchObject({
      source: "alice",
      target: "laptop",
    });
    expect(graph.links.find((l) => l.edgeKind === "link")?.label).toBe("reports to");
  });

  it("drops an ownership edge whose owner is not in the set", () => {
    // The force engine invents a node for any id it is handed, so a dangling edge does not error —
    // it silently puts a phantom, unclickable actor on screen.
    const graph = assembleActorGraph([actor("laptop", { ownerDid: "absent" })], [], []);
    expect(graph.nodes.map((n) => n.id)).toEqual(["laptop"]);
    expect(graph.links).toEqual([]);
  });

  it("drops a link whose other end was excluded", () => {
    const graph = assembleActorGraph([actor("a")], [link("l1", "a", "gone")], []);
    expect(graph.links).toEqual([]);
  });

  it("adds workspace hubs only when asked", () => {
    const rows = [actor("a", { workspaceId: "w1" })];
    const off = assembleActorGraph(rows, [], [workspace("w1")], { workspaceNodes: false });
    expect(off.nodes).toHaveLength(1);

    const on = assembleActorGraph(rows, [], [workspace("w1")], { workspaceNodes: true });
    const hub = on.nodes.find((n) => n.nodeKind === "workspace");
    expect(hub).toMatchObject({ id: workspaceNodeId("w1"), label: "WS w1", workspaceColor: "#123456" });
  });

  it("keeps connected actors when the cap bites, and reports the real total", () => {
    const rows = [
      // Newest first, so a cap that only sorted by date would keep the two isolated ones.
      actor("iso1", { registeredAt: new Date("2026-06-01") }),
      actor("iso2", { registeredAt: new Date("2026-05-01") }),
      actor("owner", { registeredAt: new Date("2026-01-02") }),
      actor("owned", { ownerDid: "owner", registeredAt: T0 }),
    ];
    const graph = assembleActorGraph(rows, [], [], { nodeCap: 2 });

    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["owned", "owner"]);
    expect(graph.truncated).toBe(true);
    expect(graph.totalActors).toBe(4);
    expect(graph.links).toHaveLength(1);
  });

  it("never drops a pinned actor", () => {
    const rows = [actor("iso", { registeredAt: new Date("2026-06-01") }), actor("focus")];
    const graph = assembleActorGraph(rows, [], [], { nodeCap: 1, pinned: ["focus"] });
    expect(graph.nodes.map((n) => n.id)).toEqual(["focus"]);
  });

  it("counts degree from the edges actually drawn", () => {
    const graph = assembleActorGraph(
      [actor("a"), actor("b"), actor("c", { ownerDid: "a" })],
      [link("l1", "a", "b")],
      []
    );
    const degrees = Object.fromEntries(graph.nodes.map((n) => [n.id, n.degree]));
    expect(degrees).toEqual({ a: 2, b: 1, c: 1 });
  });
});

describe("egoSubgraph", () => {
  const chain = () =>
    assembleActorGraph(
      [
        actor("focus"),
        actor("near", { ownerDid: "focus" }),
        actor("far", { ownerDid: "near" }),
        actor("unrelated"),
      ],
      [],
      []
    );

  it("reaches one hop at depth 1 and two at depth 2", () => {
    expect(egoSubgraph(chain(), "focus", 1).nodes.map((n) => n.id).sort()).toEqual(["focus", "near"]);
    expect(egoSubgraph(chain(), "focus", 2).nodes.map((n) => n.id).sort()).toEqual([
      "far",
      "focus",
      "near",
    ]);
  });

  it("treats a workspace hub as a leaf", () => {
    // Every member of a workspace is one hop from its hub, so expanding a hub would drag a whole
    // workspace into a view that exists to be small — at depth 2 here, `sibling` must stay out.
    const graph = assembleActorGraph(
      [actor("focus", { workspaceId: "w1" }), actor("sibling", { workspaceId: "w1" })],
      [],
      [workspace("w1")],
      { workspaceNodes: true }
    );
    const ego = egoSubgraph(graph, "focus", 2);
    expect(ego.nodes.map((n) => n.id).sort()).toEqual(["focus", workspaceNodeId("w1")]);
  });

  it("stops at the cap and says so", () => {
    const graph = assembleActorGraph(
      [actor("focus"), actor("n1", { ownerDid: "focus" }), actor("n2", { ownerDid: "focus" })],
      [],
      []
    );
    const ego = egoSubgraph(graph, "focus", 1, { nodeCap: 2 });
    expect(ego.nodes).toHaveLength(2);
    expect(ego.truncated).toBe(true);
  });

  it("returns an empty graph for an unknown focus", () => {
    expect(egoSubgraph(chain(), "nobody", 1).nodes).toEqual([]);
  });
});

describe("applyGraphFilters", () => {
  const graph = () =>
    assembleActorGraph(
      [
        actor("human", { kind: "human", workspaceId: "w1" }),
        actor("agent", { kind: "openclaw", ownerDid: "human", workspaceId: "w1" }),
        actor("lonely", { kind: "mcp" }),
      ],
      [],
      [workspace("w1")],
      { workspaceNodes: true }
    );

  it("hides isolated actors when connectedOnly is on (the default)", () => {
    const out = applyGraphFilters(graph(), DEFAULT_FILTERS);
    expect(out.nodes.map((n) => n.id)).not.toContain("lonely");
  });

  it("keeps them when it is off", () => {
    const out = applyGraphFilters(graph(), { ...DEFAULT_FILTERS, connectedOnly: false });
    expect(out.nodes.map((n) => n.id)).toContain("lonely");
  });

  it("leaves no orphaned edge when a kind is filtered out", () => {
    const out = applyGraphFilters(graph(), {
      ...DEFAULT_FILTERS,
      kinds: ["openclaw", "mcp"],
      connectedOnly: false,
    });
    const ids = new Set(out.nodes.map((n) => n.id));
    expect(ids.has("human")).toBe(false);
    for (const l of out.links) {
      expect(ids.has(l.source)).toBe(true);
      expect(ids.has(l.target)).toBe(true);
    }
  });

  it("re-isolates an actor whose only edge pointed at a hidden node", () => {
    // `agent`'s single relationship is its ownership by `human`. Hiding humans must make it
    // isolated — which only works because degrees are recomputed after the edge filter, not
    // carried over from the unfiltered graph.
    const out = applyGraphFilters(graph(), {
      ...DEFAULT_FILTERS,
      kinds: ["openclaw", "mcp"],
      edgeKinds: ["ownership", "link"],
    });
    expect(out.nodes).toEqual([]);
  });

  it("drops workspace hubs with the workspace edge kind", () => {
    const out = applyGraphFilters(graph(), {
      ...DEFAULT_FILTERS,
      edgeKinds: ["ownership", "link"],
    });
    expect(out.nodes.some((n) => n.nodeKind === "workspace")).toBe(false);
  });

  it("does not mutate the graph it was given", () => {
    const original = graph();
    const before = original.nodes.map((n) => n.degree);
    applyGraphFilters(original, { ...DEFAULT_FILTERS, kinds: ["human"] });
    expect(original.nodes.map((n) => n.degree)).toEqual(before);
  });
});

describe("kind colours", () => {
  it("covers every kind in the actor-kind registry", () => {
    // The canvas can't use Tailwind classes, so `KIND_TOKEN` is a parallel map to
    // `ACTOR_KIND_META`'s `badgeClass`. This is what stops a newly added kind from silently
    // rendering in the fallback grey.
    for (const kind of Object.keys(ACTOR_KIND_META)) {
      expect(KIND_TOKEN[kind], `no graph colour for kind "${kind}"`).toBeTruthy();
    }
  });
});
