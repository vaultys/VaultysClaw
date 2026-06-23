/**
 * GET /api/users/invite
 * Create a registration certificate for a new (non-owner) user.
 * Returns connection info so the admin can show a QR code. Owner or admin.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { usersContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(usersContract, {
  invite: async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isOwner && !session?.user?.isAdmin) {
      throw new APIException("FORBIDDEN");
    }

    // Always creates a registration cert (new user, never becomes owner)
    const cert = await UserServerChannel.createRegistrationCertificate();
    const connectionString = await UserServerChannel.startP2PSession(cert);
    if (!cert.connection) {
      throw new APIException("INTERNAL_ERROR", "Failed to start invite session");
    }

    const serverSecret = await SettingsDAO.get("serverSecret");
    const serverDid = serverSecret
      ? VaultysId.fromSecret(serverSecret, "base64").did
      : null;

    return {
      status: 200,
      body: {
        connectionString,
        token: cert.connection,
        key: cert.key,
        serverDid,
      },
    };
  },
});

export const GET = handlers.GET!;
