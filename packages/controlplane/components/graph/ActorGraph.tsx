"use client";

import dynamic from "next/dynamic";
import type { ActorGraphProps } from "./actor-graph/types";

// three.js is heavy and strictly client-only — same treatment OpenLayers gets in
// `components/map/WorldMap.tsx`.
const DynamicGraphInner = dynamic(() => import("./actor-graph/GraphInner").then((m) => m.GraphInner), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-background-100 rounded-xl animate-pulse" />,
});

/** The one graph component, shared by the estate view (`/admin/graph`) and the ego view on an
 *  Actor's Relationships tab. */
export function ActorGraph(props: ActorGraphProps) {
  return (
    <div style={{ height: props.height ?? 600 }} className={props.className}>
      <DynamicGraphInner {...props} className="" />
    </div>
  );
}
