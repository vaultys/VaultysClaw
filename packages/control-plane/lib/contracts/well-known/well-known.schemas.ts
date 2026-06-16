import { z } from "zod";

// ─────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────

export const VaultysWellKnownSchema = z.object({
  serverId: z.string(),
  signature: z.string(),
});
