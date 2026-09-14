"use client";

import { useRouter } from "next/navigation";
import { encodeDidParam } from "@/lib/actor-route";
import { ActorGraph } from "./ActorGraph";
import type { ActorGraphData } from "./actor-graph/types";

/**
 * One Actor's neighbourhood, on its Relationships tab.
 *
 * Depth is a link rather than local state: the data comes from a bounded server-side crawl
 * (`buildEgoGraph`), so a second hop is a fetch, not a client-side expansion of something already
 * loaded. It sits *alongside* the textual lists on that tab, which stay the accessible view and
 * carry the forms that actually edit a relationship.
 */
export function ActorEgoGraph({
  data,
  focusDid,
  depth,
}: {
  data: ActorGraphData;
  focusDid: string;
  depth: number;
}) {
  const router = useRouter();
  const encoded = encodeDidParam(focusDid);

  if (data.nodes.length <= 1) {
    return (
      <div className="border border-dashed border-neutral-300 rounded-xl p-8 text-center">
        <p className="text-sm text-foreground-500">
          Nothing to draw yet — this actor has no owner, owns nothing, and has no links.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ActorGraph
        data={data}
        focusDid={focusDid}
        height={420}
        className="border border-neutral-200/60 rounded-xl overflow-hidden"
      />
      <div className="flex items-center gap-3 text-xs text-foreground-400">
        <span>
          {data.nodes.length - 1} neighbour{data.nodes.length === 2 ? "" : "s"} within {depth} hop
          {depth === 1 ? "" : "s"}
        </span>
        <button
          onClick={() =>
            router.push(
              `/admin/actors/${encoded}?tab=relationships${depth === 1 ? "&depth=2" : ""}`
            )
          }
          className="font-medium text-primary-600 hover:text-primary-500"
        >
          {depth === 1 ? "Show 2 hops →" : "← Back to 1 hop"}
        </button>
        {data.truncated && <span>Truncated — too many neighbours to draw them all.</span>}
      </div>
    </div>
  );
}
