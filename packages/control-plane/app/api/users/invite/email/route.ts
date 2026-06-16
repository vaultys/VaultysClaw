/**
 * POST /api/users/invite/email
 * Send an email invitation to a new user with a unique registration link.
 * Creates an unclaimed user record and stores invitation token.
 * Owner or admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { sendMail } from "@/lib/smtp";
import { SettingsDAO, UserDAO } from "@/db";
import { forbidden, malformed } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * @openapi
 * /api/users/invite/email:
 *   post:
 *     summary: Send an email invitation to a new user.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email of the user to invite.
 *               name:
 *                 type: string
 *                 description: The name of the user to invite.
 *               role:
 *                 type: string
 *                 description: The role assigned to the user.
 *             required:
 *               - email
 *               - name
 *     responses:
 *       200:
 *         description: Invitation sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: The invitation token.
 *                 userId:
 *                   type: string
 *                   description: The ID of the unclaimed user.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to send invitation.
 */
export const POST = withError(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner && !session?.user?.isAdmin) {
    return forbidden();
  }

  const { email, name, role, skipEmail } = (await request.json()) as {
    email?: string;
    name?: string;
    role?: string;
    skipEmail?: boolean;
  };

  if (!email || !name) {
    return malformed("Email and name required");
  }

  const userRole = role ?? "member";
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { token, userId } = await UserDAO.createInvitation(
    email,
    name,
    userRole,
    expiresAt
  );

  if (!skipEmail) {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${token}`;

    const platformName = (await SettingsDAO.get("platformName")) || "VaultysClaw";
    const html = `
        <h2>You're invited to ${platformName}</h2>
        <p>Hi ${name},</p>
        <p>You've been invited to join ${platformName} as a <strong>${userRole}</strong>.</p>
        <p>
          <a href="${inviteUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px;">
            Accept Invitation
          </a>
        </p>
        <p>Or paste this link in your browser: ${inviteUrl}</p>
        <p>This invitation expires in 7 days.</p>
      `;

    await sendMail({
      to: email,
      subject: `Invitation to ${platformName}`,
      html,
      text: `You've been invited to join ${platformName} as a ${userRole}. Visit: ${inviteUrl}`,
    });
  }

  return NextResponse.json({ token, userId });
});
