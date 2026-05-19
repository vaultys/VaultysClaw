import { NextResponse } from "next/server";
import { getRealmById, getRealmUsers } from "@/lib/db";

/**
 * GET /api/users/search?realm=[realmId]&q=[search query]
 * List users in a realm with optional search by name/email
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const realmId = searchParams.get("realm");
    const query = searchParams.get("q")?.toLowerCase() || "";

    if (!realmId) {
      return NextResponse.json({ error: "Missing realm parameter" }, { status: 400 });
    }

    // Verify realm exists
    const realm = getRealmById(realmId);
    if (!realm) {
      return NextResponse.json({ error: "Realm not found" }, { status: 404 });
    }

    const realmUsers = getRealmUsers(realmId);

    // Filter by search query (name or email)
    const filtered = realmUsers.filter((user) => {
      if (!query) return true;
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });

    const users = filtered.map((user) => ({
      id: user.user_id,
      name: user.name || "Unknown",
      email: user.email || "No email",
      joinedAt: user.joined_at,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Failed to search users:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}
