import { adminAgentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { APIException } from "@/lib/api/utils/api-utils";

const handlers = createNextRoute(adminAgentsContract, {
  listPeers: async () => {
    throw new APIException("UNAVAILABLE", "Not implemented");
  },

  createPeer: async () => {
    throw new APIException("UNAVAILABLE", "Not implemented");
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
