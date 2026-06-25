import type { MapMarker } from "@/lib/contracts";

export type { MapMarker };

export const TYPE_COLOR: Record<MapMarker["type"], string> = {
  agent: "#6366f1",
  user: "#10b981",
  docling: "#f59e0b",
  s3: "#3b82f6",
};

export const TYPE_ONLINE_COLOR: Record<MapMarker["type"], string> = {
  agent: "#818cf8",
  user: "#34d399",
  docling: "#fbbf24",
  s3: "#60a5fa",
};

/** Marker types in priority order, used for dominant-type and legend ordering. */
export const MARKER_TYPES = ["agent", "user", "docling", "s3"] as const;

export interface MapCluster {
  id: string;
  lat: number;
  lon: number;
  count: number;
  markers: MapMarker[];
  byType: Record<MapMarker["type"], number>;
  dominantType: MapMarker["type"];
  onlineCount: number;
}

export type RenderPoint =
  | { kind: "marker"; marker: MapMarker }
  | { kind: "cluster"; cluster: MapCluster };

export interface TooltipState {
  kind: "marker" | "cluster";
  marker?: MapMarker;
  cluster?: MapCluster;
  x: number;
  y: number;
}

export interface MapLocation {
  lat: number;
  lon: number;
  label: string;
}

export interface WorldMapProps {
  markers: MapMarker[];
  height?: number;
  className?: string;
  onMarkerClick?: (marker: MapMarker) => void;
  onSaveLocation?: (
    marker: MapMarker,
    loc: MapLocation | null
  ) => Promise<void>;
  canEditLocation?: boolean | ((marker: MapMarker) => boolean);
}

export const CLUSTER_ZOOM_THRESHOLD = 10;
export const DETAIL_ZOOM_LEVEL = 10;
export const MAX_MAP_ZOOM = 20;

/** Display label for a marker type (handles the "s3"/"docling" special cases). */
export function markerTypeLabel(type: MapMarker["type"]): string {
  if (type === "s3") return "Storage";
  if (type === "docling") return "Docling";
  return type;
}
