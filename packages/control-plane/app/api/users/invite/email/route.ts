/**
 * POST /api/users/invite/email
 * Send an email invitation to a new user with a unique registration link.
 * Creates an unclaimed user record and stores invitation token. Owner or admin.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { sendMail } from "@/lib/smtp";
import { SettingsDAO, UserDAO } from "@/db";
import { APIException } from "@/lib/api/utils/api-utils";
import { usersContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { isAdminRole, isOwnerRole, normalizeRole } from "@/lib/roles";

const handlers = createNextRoute(usersContract, {
  inviteEmail: async ({ body }) => {
    const session = await getServerSession(authOptions);
    if (!isOwnerRole(session?.user?.role) && !isAdminRole(session?.user?.role)) {
      throw new APIException("FORBIDDEN");
    }

    const { email, name, role, skipEmail } = body;
    const userRole = normalizeRole(role);
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

      const platformName =
        (await SettingsDAO.get("platformName")) || "VaultysClaw";
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

    return { status: 200, body: { token, userId } };
  },
});

export const POST = handlers.POST!;
