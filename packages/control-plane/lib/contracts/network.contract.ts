import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

export const networkContract = c.router({
  get: {
    method: "GET",
    path: "/api/network",
    summary: "Retrieve live transport stats and server state",
    responses: {
      200: c.type<{
        stats: Record<string, unknown> | null;
        logs: { ws: string[]; peerjs: string[] };
        peerjs: {
          peerId: string | null;
          running: boolean;
          startedAt: string | null;
          serverUrl: string | null;
        };
      }>(),
      ...commonErrorResponses,
    },
  },

  control: {
    method: "POST",
    path: "/api/network",
    summary: "Control WS and PeerJS servers at runtime",
    body: z.object({
      action: z.enum(["start", "stop", "restart-ws", "restart-peerjs"]),
      serverUrl: z.string().nullable().optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});

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

export const graphContract = c.router({
  get: {
    method: "GET",
    path: "/api/graph",
    summary: "Retrieve the full relationship graph of nodes and edges",
    query: z.object({
      agent: z.string().optional(),
      user: z.string().optional(),
      realm: z.string().optional(),
    }),
    responses: {
      200: c.type<{
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
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
