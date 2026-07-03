import { UserServerChannel } from "@/lib/user-server-channel";
import { UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  publicContract,
} from "@/lib/contracts";

/**
 * GET /api/user/connect — create a certificate for the connection flow.
 * `register=true` (or no users yet) issues a registration/claim cert; otherwise
 * a login cert. Returns the raw key (hex) so the browser can build the QR URL.
 */
const handlers = createNextRoute(publicContract.userAuth, {
  connect: async ({ query }) => {
    const hasUsers = (await UserDAO.list({ page: 1, pageSize: 1 })).total > 0;
    const shouldRegister = query.register === true || !hasUsers;

    const cert = shouldRegister
      ? await UserServerChannel.createRegistrationCertificate()
      : await UserServerChannel.createConnectionCertificate();

    return { status: 200, body: { key: cert.key, token: cert.connection! } };
  },
});

export const GET = handlers.GET!;
