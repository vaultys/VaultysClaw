/**
 * PATCH /api/users/[did]/admin
 * Promote or demote a user to/from admin. Owner-only.
 * The owner cannot demote themselves.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDAO } from "@/db";

/**
 * @openapi
 * /api/users/{did}/admin:
 *   patch:
 *     summary: Promote or demote a user to/from admin.
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *         description: The decentralized identifier of the user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isAdmin:
 *                 type: boolean
 *                 description: Whether the user should be an admin.
 *     responses:
 *       200:
 *         description: User admin status updated successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { did } = await params;

  const user = await UserDAO.findByDid(did);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.isOwner) {
    return NextResponse.json(
      { error: "Cannot change the owner's admin status" },
      { status: 400 }
    );
  }

  const body = (await req.json()) as { isAdmin: boolean };
  if (typeof body.isAdmin !== "boolean") {
    return NextResponse.json(
      { error: "isAdmin must be a boolean" },
      { status: 400 }
    );
  }

  await UserDAO.update(user.id, { isAdmin: body.isAdmin });
  return NextResponse.json({ ok: true });
}
