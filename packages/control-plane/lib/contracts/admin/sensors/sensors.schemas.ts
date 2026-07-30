import { z } from "zod";

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export const ListSensorsQuerySchema = z.object({
  search: z.string().optional(),
  /** A user id, or "unassigned" to filter to devices with no assigned user. */
  assignedUserId: z.string().optional(),
  workspace: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

// ─────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────

export const AssignSensorUserBodySchema = z.object({
  assignedUserId: z.string().nullable(),
});
