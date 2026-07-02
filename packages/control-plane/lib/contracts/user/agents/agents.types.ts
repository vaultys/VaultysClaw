import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ListUserAgentsQuerySchema } from "./agents.schemas";

export type ListUserAgentsQuery = z.infer<typeof ListUserAgentsQuerySchema>;

/**
 * DB shape for the user-facing agent detail endpoint: a Prisma `Agent` with its
 * token history and usage, but WITHOUT workspace membership (`agentWorkspaces`).
 * Deliberately lighter than the admin {@link AgentWithInfo}.
 */
export type UserAgentWithUsage = Prisma.AgentGetPayload<{
  include: {
    tokenHistory: true;
    tokenUsage: {
      select: {
        promptTokens: true;
        completionTokens: true;
        updatedAt: true;
      };
    };
  };
}>;

/** {@link UserAgentWithUsage} enriched with live WebSocket connection state. */
export type UserAgentDetail = UserAgentWithUsage & {
  online: boolean;
  connectedAt: Date | null;
  lastHeartbeat: Date | null;
  reportedLlm: { provider: string; model: string } | null;
  transport: "ws" | "peerjs" | null;
};
