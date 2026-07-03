import { UserServerChannel } from "@/lib/user-server-channel";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  publicContract,
} from "@/lib/contracts";

/**
 * GET /api/user/listen/[token] — poll a connection/registration cert status.
 * Returns { status }: -1 pending, 2 success, -2 failed.
 */
const handlers = createNextRoute(publicContract.userAuth, {
  listen: async ({ params }) => {
    const cert = await UserServerChannel.listen(params.token);
    if (!cert) {
      console.log(`[listen] token=${params.token} → cert NOT FOUND`);
      return { status: 200, body: { status: -1 } };
    }
    console.log(
      `[listen] token=${params.token} → cert.id=${cert.id} cert.status=${cert.status}`
    );
    return { status: 200, body: { status: cert.status } };
  },
});

export const GET = handlers.GET!;
