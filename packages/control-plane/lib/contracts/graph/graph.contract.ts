import { c } from "../contract";
import { commonErrorResponses } from "../common";
import { GraphQuerySchema } from "./graph.schemas";
import type { GraphData } from "./graph.types";

export const graphContract = c.router({
  get: {
    method: "GET",
    path: "/api/admin/graph",
    summary: "Retrieve the relationship graph of nodes and edges",
    query: GraphQuerySchema,
    responses: {
      200: c.type<GraphData>(),
      ...commonErrorResponses,
    },
  },
});
