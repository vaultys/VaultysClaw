import { z } from "zod";

// ── Queries
export const MapQuerySchema = z.object({ workspace: z.string().optional() });
