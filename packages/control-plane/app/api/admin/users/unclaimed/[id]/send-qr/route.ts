/**
 * POST /api/admin/users/unclaimed/:id/send-qr
 * Send a QR code to an unclaimed user via email. Admin-only.
 */

import { APIException } from "@/lib/api/utils/api-utils";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";
import { sendMail, getSmtpConfig } from "@/lib/smtp";
import { SettingsDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const handlers = createNextRoute(adminContract.users, {
  sendUnclaimedQr: async ({ params, body }) => {

    const user = await UserDAO.findById(params.id);
    if (!user) throw new APIException("NOT_FOUND", "User not found");
    if (user.did)
      throw new APIException("FORBIDDEN", "User has already claimed their account");
    if (!user.email)
      throw new APIException("NOT_FOUND", "User has no email address");

    const cert = await UserServerChannel.createRegistrationCertificate({
      pendingUserId: user.id,
    });
    const connectionString = await UserServerChannel.startP2PSession(cert);

    const serverSecret = await SettingsDAO.get("serverSecret");
    const serverDid = serverSecret
      ? VaultysId.fromSecret(serverSecret, "base64").did
      : null;

    const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
    const walletUrl =
      (await SettingsDAO.get("wallet_url")) ?? "https://wallet.vaultys.net";
    const qrUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=auth${didParam}`;

    const sendByEmail = body.sendByEmail !== false;
    if (sendByEmail) {
      if (!getSmtpConfig())
        throw new APIException("MALFORMED", "SMTP is not configured");

      const displayName = user.name ?? user.email;
      await sendMail({
        to: user.email,
        subject: "Claim your VaultysClaw account",
        text: [
          `Hi ${displayName},`,
          "",
          "An administrator has sent you a registration link to activate your VaultysClaw account.",
          "Scan the QR code or open the link below in your Vaultys wallet:",
          "",
          qrUrl,
          "",
          "This link is single-use and will expire after 4 minutes of inactivity.",
          "",
          "If you did not expect this email, please ignore it.",
        ].join("\n"),
        html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#4f46e5">Claim your VaultysClaw account</h2>
          <p>Hi <strong>${escapeHtml(displayName)}</strong>,</p>
          <p>An administrator has sent you a registration link to activate your VaultysClaw account.<br>
             Scan the QR code or tap the button below in your
             <strong>Vaultys wallet</strong>.</p>
          <div style="margin:24px 0;text-align:center">
            <a href="${escapeHtml(qrUrl)}"
               style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
              Claim my account
            </a>
          </div>
          <p style="font-size:12px;color:#6b7280">
            This link is single-use and expires after a short period of inactivity.<br>
            If you did not expect this email, please ignore it.
          </p>
        </div>`,
      });
    }

    return {
      status: 200,
      body: {
        qrUrl,
        token: cert.connection!,
        key: cert.key,
        serverDid: serverDid ?? "",
        emailSent: sendByEmail && !!user.email,
      },
    };
  },
});

export const POST = handlers.POST!;
