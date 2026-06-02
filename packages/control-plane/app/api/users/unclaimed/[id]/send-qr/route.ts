/**
 * POST /api/users/unclaimed/:id/send-qr
 * Send a QR code to an unclaimed user via email.
 * Admin-only.
 *
 * Body:
 *   sendByEmail boolean  When true, emails the QR URL to the user's email address (default: true)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { UserServerChannel } from "@/lib/user-server-channel";
import { UserDao } from "@/lib/user-dao";
import { getSetting } from "@/lib/db";
import { VaultysId } from "@vaultys/id";
import { sendMail, getSmtpConfig } from "@/lib/smtp";

/**
 * @openapi
 * /api/users/unclaimed/{id}/send-qr:
 *   post:
 *     summary: Send a QR code to an unclaimed user via email.
 *     tags: [Users]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the unclaimed user.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sendByEmail:
 *                 type: boolean
 *                 description: When true, emails the QR URL to the user's email address.
 *                 default: true
 *     responses:
 *       200:
 *         description: QR code sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrUrl:
 *                   type: string
 *                   description: The URL of the QR code.
 *                 token:
 *                   type: string
 *                   description: The connection token.
 *                 key:
 *                   type: string
 *                   description: The connection key.
 *                 serverDid:
 *                   type: string
 *                   description: The server DID.
 *                 emailSent:
 *                   type: boolean
 *                   description: Indicates if the email was sent.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const body = (await req.json()) as {
    sendByEmail?: boolean;
  };

  const user = UserDao.getById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.did) {
    return NextResponse.json(
      { error: "User has already claimed their account" },
      { status: 400 }
    );
  }
  if (!user.email) {
    return NextResponse.json(
      { error: "User has no email address" },
      { status: 400 }
    );
  }

  // Create a registration certificate
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

  const sendByEmail = body.sendByEmail !== false;
  if (sendByEmail) {
    if (!getSmtpConfig()) {
      return NextResponse.json(
        { error: "SMTP is not configured" },
        { status: 400 }
      );
    }

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

  return NextResponse.json({
    qrUrl,
    token: cert.connection,
    key: cert.key,
    serverDid,
    emailSent: sendByEmail && !!user.email,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
