/**
 * POST /api/users/claim
 * Generate a VaultysId registration QR for an authenticated OIDC user who has
 * not yet claimed their VaultysId. Requires a valid session but NOT a DID.
 */

import { getToken } from "next-auth/jwt";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

const handlers = createNextRoute(userContract.users, {
  claim: async ({ request }) => {
    const token = await getToken({ req: request });
    if (!token?.userId) throw new APIException("UNAUTHORIZED");

    const user = await UserDAO.findById(token.userId as string);
    if (!user) throw new APIException("NOT_FOUND", "User not found");
    if (user.did)
      throw new APIException("MALFORMED", "User already has a VaultysId");

    const cert = await UserServerChannel.createRegistrationCertificate({
      pendingUserId: user.id,
    });
    console.log(
      `[claim] userId=${user.id} cert.id=${cert.id} cert.connection=${cert.connection}`
    );
    const connectionString = await UserServerChannel.startP2PSession(cert);

    const serverSecret = await SettingsDAO.get("serverSecret");
    const serverDid = serverSecret
      ? VaultysId.fromSecret(serverSecret, "base64").did
      : null;

    const walletUrl =
      (await SettingsDAO.get("walletUrl")) || "https://wallet.vaultys.net";
    const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
    // service=register triggers the wallet's full 2-round exchange for a new
    // contact; service=auth may only do 1 round, leaving the server stuck.
    const qrUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=register${didParam}`;

    return {
      status: 200,
      body: {
        qrUrl,
        connectionString,
        inviteToken: cert.connection!,
        key: cert.key,
        serverDid,
      },
    };
  },
});

export const POST = handlers.POST!;
