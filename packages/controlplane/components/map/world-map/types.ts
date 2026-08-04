/** A locatable Actor, as consumed by the world map — built server-side (lib/actor-map.ts) from
 *  every Actor with a location set, not a separate persisted "map marker" concept. */
export interface MapMarker {
  id: string; // Actor.did
  type: string; // Actor.kind — openclaw/mcp/sensor/human today, open-ended per docs §4.3
  label: string; // Actor.name
  lat: number;
  lon: number;
  online?: boolean;
  meta?: { did: string };
}

export const TYPE_COLOR: Record<string, string> = {
  openclaw: "#6366f1",
  human: "#10b981",
  sensor: "#f59e0b",
  mcp: "#3b82f6",
};
const DEFAULT_COLOR = "#94a3b8";
export function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? DEFAULT_COLOR;
}

export const TYPE_ONLINE_COLOR: Record<string, string> = {
  openclaw: "#818cf8",
  human: "#34d399",
  sensor: "#fbbf24",
  mcp: "#60a5fa",
};
const DEFAULT_ONLINE_COLOR = "#cbd5e1";
export function typeOnlineColor(type: string): string {
  return TYPE_ONLINE_COLOR[type] ?? DEFAULT_ONLINE_COLOR;
}

/** Kinds in priority order, used for dominant-type and legend ordering — falls back to whatever
 *  other kind strings actually show up (docs §4.3: kinds are open-ended) after these known ones. */
export const MARKER_TYPES = ["openclaw", "human", "sensor", "mcp"] as const;

export interface MapCluster {
  id: string;
  lat: number;
  lon: number;
  count: number;
  markers: MapMarker[];
  byType: Record<string, number>;
  dominantType: string;
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
  onSaveLocation?: (marker: MapMarker, loc: MapLocation | null) => Promise<void>;
  canEditLocation?: boolean | ((marker: MapMarker) => boolean);
}

export const CLUSTER_ZOOM_THRESHOLD = 10;
export const DETAIL_ZOOM_LEVEL = 10;
export const MAX_MAP_ZOOM = 20;
