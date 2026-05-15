import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getPendingApprovalsForUser, getAllApprovalsForUser } from "@/lib/db";

/**
 * GET /api/workflow-approvals[?all=1]
 * Returns approval/notification items for the logged-in user.
 * Without ?all=1, only pending/notified are returned.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.did) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "1";
    const approvals = all
      ? getAllApprovalsForUser(session.user.did)
      : getPendingApprovalsForUser(session.user.did);

    return NextResponse.json({ approvals });
  } catch (err) {
    console.error("GET /api/workflow-approvals error:", err);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}
