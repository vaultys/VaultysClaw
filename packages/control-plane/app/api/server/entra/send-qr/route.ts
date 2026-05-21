/**
 * POST /api/server/entra/send-qr
 * Generate a registration QR code for an Entra-provisioned (unclaimed) user.
 * Optionally sends it by email when sendByEmail=true.
 * Admin-only.
 *
 * Body:
 *   userId      string   Internal user ID (UUID) of the unclaimed Entra user
 *   sendByEmail boolean  When true, emails the QR URL to the user's email address
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { UserServerChannel } from "@/lib/user-server-channel";
import { UserDao } from "@/lib/user-dao";
import { getSetting } from "@/lib/db";
import { VaultysId } from "@vaultys/id";
import { sendMail, getSmtpConfig } from "@/lib/smtp";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    userId?: string;
    sendByEmail?: boolean;
  };

  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = UserDao.getById(body.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.entra_id) {
    return NextResponse.json({ error: "User is not an Entra-provisioned user" }, { status: 400 });
  }
  if (user.claimed_at) {
    return NextResponse.json({ error: "User has already claimed their account" }, { status: 400 });
  }

  // Create a registration certificate that carries the user ID so
  // UserServerChannel can claim the Entra record when the wallet scans it.
  const cert = UserServerChannel.createRegistrationCertificate({
    pendingUserId: user.id,
  });
  const connectionString = await UserServerChannel.startP2PSession(cert);

  const serverSecret = getSetting("serverSecret");
  let serverDid: string | null = null;
  if (serverSecret) {
    serverDid = VaultysId.fromSecret(serverSecret, "base64").did;
  }

  const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
  const walletUrl = getSetting("wallet_url") ?? "https://wallet.vaultys.net";
  const qrUrl = `${walletUrl}/#${connectionString}&protocol=p2p&service=auth${didParam}`;

  if (body.sendByEmail) {
    if (!user.email) {
      return NextResponse.json({ error: "User has no email address on record" }, { status: 400 });
    }
    if (!getSmtpConfig()) {
      return NextResponse.json({ error: "SMTP is not configured" }, { status: 400 });
    }

    const displayName = user.name ?? user.email;

    await sendMail({
      to: user.email,
      subject: "Claim your VaultysClaw account",
      text: [
        `Hi ${displayName},`,
        "",
        "An administrator has provisioned a VaultysClaw account for you.",
        "To activate it, open the link below in your Vaultys wallet (or scan the QR code it contains):",
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
          <p>An administrator has provisioned a VaultysClaw account for you.<br>
             Scan the QR code or tap the button below in your
             <strong>Vaultys wallet</strong> to activate it.</p>
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

  return NextResponse.json({
    qrUrl,
    token: cert.connection,
    key: cert.key,
    serverDid,
    emailSent: body.sendByEmail && !!user.email,
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
