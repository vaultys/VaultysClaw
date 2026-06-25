import { z } from "zod";
import type { GraphData, GraphNode, GraphEdge } from "@vaultysclaw/shared";
import { GraphQuerySchema } from "./graph.schemas";

// The graph payload shapes are owned by the shared package — reuse them as the
// single source of truth rather than redeclaring node/edge structures here.
export type { GraphData, GraphNode, GraphEdge };

export type GraphQuery = z.infer<typeof GraphQuerySchema>;

export type Filters = {
  agentDid: string | null;
  userDid: string | null;
  realmId: string | null;
};

// Shape returned by prisma.user.findMany / findUnique for graph use
export type UserRecord = {
  id: string;
  did: string | null;
  name: string | null;
  role: string;
  reportsTo: string | null;
  isOwner: boolean;
  isAdmin: boolean;
};

// Shape returned by prisma.agent queries
export type AgentRecord = {
  did: string;
  name: string;
};
