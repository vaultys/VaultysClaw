import { NextResponse } from "next/server";
import { getRealmById, getRealmUsers } from "@/lib/db";

/**
 * GET /api/users/search?realm=[realmId]&q=[search query]
 * List users in a realm with optional search by name/email
 */
/**
 * @openapi
 * /api/users/search:
 *   get:
 *     summary: List users in a realm with optional search by name/email.
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: realm
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the realm to search within.
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: The search query to filter users by name or email.
 *     responses:
 *       200:
 *         description: A list of users matching the search criteria.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       joinedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to search users due to server error.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const realmId = searchParams.get("realm");
    const query = searchParams.get("q")?.toLowerCase() || "";

    if (!realmId) {
      return NextResponse.json(
        { error: "Missing realm parameter" },
        { status: 400 }
      );
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
      // Use the DID as the canonical id — it matches session.user.did used by
      // the workflow-approvals inbox query. Fall back to user_id for legacy accounts.
      id: user.did ?? user.user_id,
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
