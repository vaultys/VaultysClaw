import { z } from "zod";
import type { GraphData, GraphNode, GraphEdge } from "@vaultysclaw/shared";
import { GraphQuerySchema } from "./graph.schemas";

// The graph payload shapes are owned by the shared package — reuse them as the
// single source of truth rather than redeclaring node/edge structures here.
export type { GraphData, GraphNode, GraphEdge };

export type GraphQuery = z.infer<typeof GraphQuerySchema>;
