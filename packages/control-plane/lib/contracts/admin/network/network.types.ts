import { z } from "zod";
import { NetworkControlBodySchema } from "./network.schemas";

// ── Network control (admin runtime control of WS / PeerJS servers) ──────────

export interface NetworkControlResponse {
  ok: boolean;
  running?: boolean;
  restarted?: boolean;
  port?: number;
  peerId?: string | null;
}

export type NetworkControlBody = z.infer<typeof NetworkControlBodySchema>;
export type NetworkControlAction = NetworkControlBody["action"];

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
