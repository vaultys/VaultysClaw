/**
 * GET /api/invitations/[token]
 * Get invitation details (unauthenticated - for email invite page)
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserInvitation } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const invitation = getUserInvitation(token);

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 404 });
    }

    return NextResponse.json({
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch invitation" }, { status: 500 });
  }
}
