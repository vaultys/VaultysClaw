import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

// `networkContract` now lives in `./network/` (folder pattern). Map and health
// stay here as small standalone routers.

export const mapContract = c.router({
  get: {
    method: "GET",
    path: "/api/map",
    summary: "Aggregate all located entities into map markers",
    query: z.object({ realm: z.string().optional() }),
    responses: {
      200: c.type<{
        markers: Array<{
          id: string;
          type: "agent" | "user" | "docling" | "s3";
          label: string;
          lat: number;
          lon: number;
          online?: boolean;
          meta?: Record<string, unknown>;
        }>;
      }>(),
      ...commonErrorResponses,
    },
  },
});

export const healthContract = c.router({
  get: {
    method: "GET",
    path: "/api/health",
    summary: "Health check for the control plane",
    responses: { 200: z.object({ status: z.string(), timestamp: z.string() }) },
  },
});
