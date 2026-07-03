import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  userContract,
} from "@/lib/contracts";

/** GET /api/user/status — whether any user exists + the server DID. Public. */
const handlers = createNextRoute(userContract.userStatus, {
  status: async () => {
    const hasUsers = await UserDAO.hasAnyUser();
    const serverSecret = await SettingsDAO.get("serverSecret");
    const serverDid = serverSecret
      ? VaultysId.fromSecret(serverSecret, "base64").did
      : null;
    return { status: 200, body: { hasUsers, serverDid } };
  },
});

export const GET = handlers.GET!;
