import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { APIException } from "@/lib/api/utils/api-utils";

const handlers = createNextRoute(adminContract.agents, {
  getPeer: async () => {
    throw new APIException("UNAVAILABLE", "Not implemented");
  },

  deletePeer: async () => {
    throw new APIException("UNAVAILABLE", "Not implemented");
  },
});

export const GET = handlers.GET!;
export const DELETE = handlers.DELETE!;
