import {
  publicContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { SettingsDAO } from "@/db";
import { VaultysId } from "@vaultys/id";
import { APIException } from "@/lib/api/utils/api-utils";

/**
 * Public Vaultys well-known discovery document.
 *
 * No authentication required — served at GET /.well-known/vaultys.json.
 */
const handlers = createNextRoute(publicContract.wellKnown, {
  vaultys: async ({ request }) => {
    const host = request.headers.get("host");
    if (!host) throw new APIException("MALFORMED", "Missing host header");
    const serverSecret = await SettingsDAO.get("serverSecret");
    if (!serverSecret)
      throw new APIException("NOT_FOUND", "Server secret not configured");
    console.log("serverSecret", serverSecret);
    const serverId = VaultysId.fromSecret(serverSecret, "base64").toVersion(1);
    const sign = (await serverId.signChallenge(host)).toString("base64");
    return {
      status: 200,
      body: {
        serverId: serverId.id.toString("base64"),
        signature: sign,
      },
    };
  },
});

export const GET = handlers.GET!;
