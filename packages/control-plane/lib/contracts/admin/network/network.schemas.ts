import { z } from "zod";

// ── Queries
export const NetworkLogQuerySchema = z.object({
  logLimit: z.coerce.number().int().min(1).max(500).optional(),
});

export const MapQuerySchema = z.object({ workspace: z.string().optional() });

// ── Bodies
export const NetworkControlBodySchema = z.object({
  action: z.enum(["start", "stop", "restart-ws", "restart-peerjs"]),
  serverUrl: z.string().nullable().optional(),
});
