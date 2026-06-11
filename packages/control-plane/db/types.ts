import { Prisma } from "@prisma/client";

export type AgentWithRealms = Prisma.AgentGetPayload<{
  include: {
    agentRealms: {
      include: {
        realm: true;
      };
    };
  };
}>;

