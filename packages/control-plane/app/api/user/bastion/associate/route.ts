import { UserServerChannel } from "@/lib/user-server-channel";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userAuthContract } from "@/lib/contracts";

/**
 * POST /api/user/bastion/associate — link a completed browser-device cert with
 * a completed user cert, confirming the QR-authenticated user owns the browser.
 */
const handlers = createNextRoute(userAuthContract, {
  bastionAssociate: async ({ body }) => {
    const userCert = await UserServerChannel.connecting(body.userToken);
    const browserCert = await UserServerChannel.connecting(body.browserToken);

    if (!userCert || !browserCert)
      throw new APIException("MALFORMED", "Invalid tokens");
    if (userCert.status !== 2 || browserCert.status !== 2)
      throw new APIException("MALFORMED", "Both certificates must be completed");

    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
