// ── Map ───────────────────────────────────────────────────────────────────

export interface MapMarker {
  id: string;
  type: "agent" | "user" | "docling" | "s3";
  label: string;
  lat: number;
  lon: number;
  online?: boolean;
  meta?: Record<string, unknown>;
}

export interface MapResponse {
  markers: MapMarker[];
}
