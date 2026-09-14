"use client";

import { ACTOR_KIND_META } from "@/lib/actor-kinds";
import { cssToken, kindToken, EDGE_OPACITY } from "./colors";
import { EDGE_KINDS, EDGE_KIND_LABEL, type ActorGraphEdgeKind } from "./types";

const EDGE_DESCRIPTION: Record<ActorGraphEdgeKind, string> = {
  ownership: "Actor.ownerDid — belongs to / acts for",
  link: "A freely-labeled ActorLink",
  workspace: "Membership of a workspace",
};

/** Kept in the DOM rather than drawn into the canvas: it is the part of this page a screen reader
 *  can actually use, and it stays readable when WebGL is unavailable. */
export function GraphLegend({ colorBy }: { colorBy: "kind" | "workspace" }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-foreground-500">
      {colorBy === "kind" &&
        Object.keys(ACTOR_KIND_META).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: cssToken(kindToken(kind)) }} />
            {ACTOR_KIND_META[kind].label}
          </span>
        ))}
      {colorBy === "workspace" && (
        <span className="text-foreground-400">Nodes coloured by their workspace.</span>
      )}

      <span className="h-3 w-px bg-neutral-200" aria-hidden />

      {EDGE_KINDS.map((edge) => (
        <span key={edge} className="flex items-center gap-1.5" title={EDGE_DESCRIPTION[edge]}>
          <span
            className="w-4 h-px"
            style={{
              background: cssToken(
                edge === "ownership" ? "primary-400" : edge === "link" ? "secondary-400" : "neutral-300"
              ),
              opacity: Math.max(EDGE_OPACITY[edge], 0.45),
            }}
          />
          {EDGE_KIND_LABEL[edge]}
        </span>
      ))}
    </div>
  );
}
