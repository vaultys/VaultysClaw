import { z } from "zod";

/**
 * Canonical error body returned by every API route.
 *
 * `code` is a stable, machine-readable identifier (e.g. `FORBIDDEN`,
 * `BAD_REQUEST`) that the client (`BaseApi` / `ApiError`) reads to branch on
 * error kinds without string-matching the human-readable `error` message.
 * `details` carries structured validation info when relevant.
 */
export const ErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorBody = z.infer<typeof ErrorSchema>;

/**
 * Error responses shared by most authenticated routes. Spread these into a
 * route's `responses` map so the contract documents — and the implementation
 * is type-checked against — every status it may legitimately return.
 */
export const commonErrorResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  500: ErrorSchema,
  503: ErrorSchema,
} as const;

export const commonPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  });