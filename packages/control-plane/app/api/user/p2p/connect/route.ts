import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userAuthContract } from "@/lib/contracts";

/**
 * GET /api/user/p2p/connect — open a server-side PeerJS channel, run the full
 * Challenger auth when the wallet connects, and update the cert on completion.
 */
const handlers = createNextRoute(userAuthContract, {
  p2pConnect: async () => {
    const hasUsers = (await UserDAO.list({ page: 1, pageSize: 1 })).total > 0;
    const shouldRegister = !hasUsers;
    console.log(
      `[p2p/connect] hasAnyUser=${hasUsers} → cert type=${shouldRegister ? "REGISTER" : "LOGIN"}`
    );
    const cert = shouldRegister
      ? await UserServerChannel.createRegistrationCertificate()
      : await UserServerChannel.createConnectionCertificate();

    const connectionString = await UserServerChannel.startP2PSession(cert);

    const serverSecret = await SettingsDAO.get("serverSecret");
    const serverDid = serverSecret
      ? VaultysId.fromSecret(serverSecret, "base64").did
      : null;

    return {
      status: 200,
      body: {
        connectionString,
        token: cert.connection!,
        key: cert.key,
        serverDid,
      },
    };
  },
});

export const GET = handlers.GET!;
