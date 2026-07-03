/**
 * POST /api/users/invite/from-email
 * Generate a QR code from an email invitation token. Unauthenticated — lets
 * invited users generate a QR from their invite link.
 */

import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.users, {
  inviteFromEmail: async ({ body }) => {
    const invitation = await UserDAO.findInvitation(body.token);
    if (!invitation) throw new APIException("NOT_FOUND", "Invitation not found");

    if (new Date(invitation.expiresAt) < new Date())
      throw new APIException("NOT_FOUND", "Invitation expired");

    // Registration certificate carries the pending user id so the record is
    // claimed with the right name/email on completion.
    const cert = await UserServerChannel.createRegistrationCertificate({
      pendingUserId: invitation.userId ?? undefined,
      invitationToken: body.token,
    });
    const connectionString = await UserServerChannel.startP2PSession(cert);

    const serverSecret = await SettingsDAO.get("serverSecret");
    const serverDid = serverSecret
      ? VaultysId.fromSecret(serverSecret, "base64").did
      : null;

    const walletUrl =
      (await SettingsDAO.get("walletUrl")) || "https://wallet.vaultys.net";
    const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
    const qrUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=auth${didParam}`;

    await UserDAO.claimInvitation(body.token);

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
