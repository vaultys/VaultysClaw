import { z } from "zod";

// ── Queries
export const MapQuerySchema = z.object({ workspace: z.string().optional() });

// ── Bodies
export const NetworkControlBodySchema = z.object({
  action: z.enum(["start", "stop", "restart-ws", "restart-peerjs"]),
  serverUrl: z.string().nullable().optional(),
});
