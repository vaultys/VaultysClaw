import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { getUserRealms } from "@/lib/db";
import { UserDao } from "@/lib/user-dao";

/**
 * GET /api/me/realms
 * Get realms the current user belongs to (for channel creation)
 * Resolves the user's UUID from their DID since user_realms uses users.id (UUID)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    // user_realms.user_id references users.id (UUID), not users.did
    // Resolve UUID from the session DID
    const user = UserDao.getByDid(auth.did);
    const userId = user?.id ?? auth.did;

    const rows = getUserRealms(userId);

    const realms = rows.map((r) => ({
      id: r.realm_id,
      name: r.name,
      slug: r.slug,
      color: r.color,
    }));

    return NextResponse.json({ realms });
  } catch (err) {
    console.error("GET /api/me/realms error:", err);
    return NextResponse.json(
      { error: "Failed to fetch realms" },
      { status: 500 }
    );
  }
}
