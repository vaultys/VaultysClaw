import { z } from "zod";

// ── Bodies
export const NetworkControlBodySchema = z.object({
  action: z.enum(["start", "stop", "restart-ws", "restart-peerjs"]),
  serverUrl: z.string().nullable().optional(),
});
