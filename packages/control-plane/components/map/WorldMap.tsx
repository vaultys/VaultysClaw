"use client";

import dynamic from "next/dynamic";
import type { WorldMapProps } from "./world-map/types";

// OpenLayers is heavy and client-only — load the map implementation lazily.
const DynamicMapInner = dynamic(
  () => import("./world-map/MapInner").then((m) => m.MapInner),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ width: "100%", height: "400px" }}
        className="bg-background-100 rounded-lg animate-pulse"
      />
    ),
  }
);

export function WorldMap(props: WorldMapProps) {
  return <DynamicMapInner {...props} />;
}

// Re-exported for back-compat with existing dynamic imports across the app.
export { LocationEditor } from "./world-map/LocationEditor";
export { geocodeCity } from "./world-map/geocode";
