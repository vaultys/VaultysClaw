import { z } from "zod";
import { VaultysWellKnownSchema } from "./well-known.schemas";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type VaultysWellKnown = z.infer<typeof VaultysWellKnownSchema>;
