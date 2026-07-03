/**
 * GET /api/users/invite
 * Create a registration certificate for a new (non-owner) user.
 * Returns connection info so the admin can show a QR code. Owner or admin.
 */

import { isAdminRole, isOwnerRole } from "@/lib/roles";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.users, {
  invite: async ({ query }) => {
    const session = await getServerSession(authOptions);
    if (!isOwnerRole(session?.user?.role) && !isAdminRole(session?.user?.role)) {
      throw new APIException("FORBIDDEN");
    }

    // When a userId is supplied, bind the registration cert to that unclaimed
    // record so scanning the QR claims it (keeping its name/email/role) instead
    // of creating a brand-new user.
    let pendingUserId: string | undefined;
    if (query.userId) {
      const pending = await UserDAO.findById(query.userId);
      if (!pending || pending.did || pending.claimedAt) {
        throw new APIException("NOT_FOUND", "User not found or already claimed");
      }
      pendingUserId = pending.id;
    }

    // Always creates a registration cert (new user, never becomes owner)
    const cert = await UserServerChannel.createRegistrationCertificate(
      pendingUserId ? { pendingUserId } : undefined
    );
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
