"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
      <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
        Nothing to draw yet — this actor has no owner, owns nothing, and has no links
      </p>
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
      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-500">
        <span className="tabular-nums">
          {data.nodes.length - 1} neighbour{data.nodes.length === 2 ? "" : "s"} within {depth} hop
          {depth === 1 ? "" : "s"}
        </span>
        <button
          onClick={() =>
            router.push(
              `/admin/actors/${encoded}?tab=relationships${depth === 1 ? "&depth=2" : ""}`
            )
          }
          className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline"
        >
          {depth === 1 ? (
            <>
              Show 2 hops
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </>
          ) : (
            <>
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Back to 1 hop
            </>
          )}
        </button>
        {data.truncated && <span>Truncated — too many neighbours to draw them all</span>}
      </div>
    </div>
  );
}
