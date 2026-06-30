import { UserServerChannel } from "@/lib/user-server-channel";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userAuthContract } from "@/lib/contracts";

/**
 * POST /api/user/bastion/listen/[token] — poll whether the bastion connection
 * has been authenticated by the user's wallet. status 2 + browserDid = success.
 */
const handlers = createNextRoute(userAuthContract, {
  bastionListen: async ({ params }) => {
    const result = await UserServerChannel.listenBastion(params.token);
    if (!result) return { status: 200, body: { status: -1 } };
    return { status: 200, body: result };
  },
});

export const POST = handlers.POST!;
