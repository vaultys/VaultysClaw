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
