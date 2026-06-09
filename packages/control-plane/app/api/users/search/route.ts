import { NextResponse } from "next/server";
import { RealmDAO } from "@/db";
import { malformed, notFound } from "@/lib/api/utils/api-utils";

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
  const { searchParams } = new URL(request.url);
  const realmId = searchParams.get("realm");
  const query = searchParams.get("q")?.toLowerCase() || "";

  if (!realmId) {
    return malformed("Missing realm parameter");
  }

  // Verify realm exists
  const realm = await RealmDAO.findById(realmId);
  if (!realm) {
    return notFound("Realm not found");
  }

  const realmUsers = await RealmDAO.getUsers(realmId);

  // Filter by search query (name or email)
  const filtered = realmUsers.filter((row) => {
    if (!query) return true;
    const name = (row.user.name || "").toLowerCase();
    const email = (row.user.email || "").toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const users = filtered.map((row) => ({
    // Use the DID as the canonical id — it matches session.user.did used by
    // the workflow-approvals inbox query. Fall back to userId for legacy accounts.
    id: row.user.did ?? row.userId,
    name: row.user.name || "Unknown",
    email: row.user.email || "No email",
    joinedAt: row.joinedAt,
  }));

  return NextResponse.json({ users });
}
