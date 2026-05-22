/**
 * DELETE /api/invitations/[token]/delete
 * Delete an invitation after it's been successfully claimed
 * Unauthenticated - called after successful wallet connection
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const db = getDb();
    db.prepare("DELETE FROM user_invitations WHERE token = ?").run(token);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting invitation:", err);
    return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
  }
}
