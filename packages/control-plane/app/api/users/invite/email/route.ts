/**
 * POST /api/users/invite/email
 * Send an email invitation to a new user with a unique registration link.
 * Creates an unclaimed user record and stores invitation token.
 * Owner or admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { createUserInvitation, getSetting, getDb } from "@/lib/db";
import { sendMail } from "@/lib/smtp";

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
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { email, name, role } = await request.json() as { email?: string; name?: string; role?: string };

    if (!email || !name) {
      return NextResponse.json({ error: "Email and name required" }, { status: 400 });
    }

    const userRole = role ?? "member";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Check if this email already has an active invitation
    const db = getDb();
    const existingInvitation = db.prepare(
      "SELECT token FROM user_invitations WHERE email = ? AND expires_at > datetime('now')"
    ).get(email) as { token: string } | undefined;

    // Delete old invitation if it exists (will create new one)
    if (existingInvitation) {
      db.prepare("DELETE FROM user_invitations WHERE email = ?").run(email);
    }

    // Check if unclaimed user already exists for this email
    let unclaimed = db.prepare(
      "SELECT id FROM users WHERE email = ? AND did IS NULL"
    ).get(email) as { id: string } | undefined;

    const userId = unclaimed?.id ?? crypto.randomUUID();

    // Create or update unclaimed user record
    if (!unclaimed) {
      db.prepare(
        "INSERT INTO users (id, did, name, email, role) VALUES (?, NULL, ?, ?, ?)"
      ).run(userId, name, email, userRole);
    } else {
      // Update existing unclaimed user with new name/role
      db.prepare(
        "UPDATE users SET name = ?, role = ? WHERE id = ?"
      ).run(name, userRole, userId);
    }

    // Create invitation token linked to user
    const token = createUserInvitation(email, name, userRole, expiresAt);
    // Store the link between invitation and user
    db.prepare(
      "INSERT INTO user_invitations (token, email, name, role, expires_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(token) DO UPDATE SET email = excluded.email, name = excluded.name, role = excluded.role"
    ).run(token, email, name, userRole, expiresAt);

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${token}`;

    const platformName = getSetting("platformName") || "VaultysClaw";
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

    return NextResponse.json({ token, userId });
  } catch (err) {
    console.error("Email invitation error:", err);
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
