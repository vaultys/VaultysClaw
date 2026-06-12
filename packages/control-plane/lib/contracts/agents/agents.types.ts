import { Prisma } from "@prisma/client";
import { ListAgentsQuerySchema } from "./agents.schemas";
import z from "zod";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AgentWithInfo = Prisma.AgentGetPayload<{
  select: {
    did: true;
    name: true;
    capabilities: true;
    registeredAt: true;
    lastSeen: true;
    locationLat: true;
    locationLon: true;
    locationLabel: true;
  };
  include: {
    agentRealms: {
      include: {
        realm: {
          select: {
            id: true;
            name: true;
            slug: true;
            color: true;
            isDefault: true;
          };
        };
      };
    };
    tokenUsage: {
      select: {
        promptTokens: true;
        completionTokens: true;
        updatedAt: true;
      };
    };
  };
}>;

export type AgentInfo = AgentWithInfo & {
  online: boolean;
  connectedAt: Date | null;
  lastHeartbeat: Date | null;
  reportedLlm: { provider: string; model: string } | null;
  transport: "ws" | "peerjs" | null;
};

export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;
