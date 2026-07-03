import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  publicContract,
} from "@/lib/contracts";

/**
 * GET /api/public/user/bastion/connect — initiate the bastion (browser-device) flow.
 * Returns { key }: the connection key encrypted for the browser's VaultysId.
 */
const handlers = createNextRoute(publicContract.userAuth, {
  bastionConnect: async ({ query, request }) => {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "";
    const userAgent = request.headers.get("user-agent") ?? "";
    const deviceType =
      query.type === "extension"
        ? ("BROWSER_EXTENSION" as const)
        : ("BROWSER" as const);

    // Normalise vid to a v1 id
    const vaultysId = VaultysId.fromId(
      Buffer.from(query.vid, "base64")
    ).toVersion(1);
    const vid64 = vaultysId.id.toString("base64");

    const result = await UserServerChannel.handleBastionConnect(
      vid64,
      ip,
      userAgent,
      deviceType
    );
    if (!result)
      throw new APIException(
        "INTERNAL_ERROR",
        "Failed to create bastion certificate"
      );

    return { status: 200, body: result };
  },
});

export const GET = handlers.GET!;
