import { Prisma } from "@prisma/client";

export type AgentWithRealms = Prisma.AgentGetPayload<{
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
  };
}>;

export type AgentModelWithRealms = AgentWithRealms;

