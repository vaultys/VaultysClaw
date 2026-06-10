/**
 * GET   /api/users/me — Return the current user's profile.
 * PATCH /api/users/me — Update the current user's own name.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDAO } from "@/db";
import { malformed, notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Return the current user's profile.
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Successful response with user profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 did:
 *                   type: string
 *                 name:
 *                   type: string
 *                   nullable: true
 *                 isOwner:
 *                   type: boolean
 *                 isAdmin:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET = withError(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return unauthorized();
  }

  const user = await UserDAO.findByDid(session.user.did);
  if (!user) {
    return notFound("User not found");
  }

  return NextResponse.json({
    did: user.did,
    name: user.name ?? null,
    isOwner: user.isOwner,
    isAdmin: user.isAdmin || user.isOwner,
  });
});

/**
 * @openapi
 * /api/users/me:
 *   patch:
 *     summary: Update the current user's own name.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the user.
 *                 maxLength: 128
 *     responses:
 *       200:
 *         description: Successfully updated the user's name.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 name:
 *                   type: string
 *                   nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const PATCH = withError(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return unauthorized();
  }

  const body = (await req.json()) as { name?: unknown };

  if (typeof body.name !== "string") {
    return malformed("name must be a string");
  }

  const name = body.name.trim();
  if (name.length > 128) {
    return malformed("name must be 128 characters or fewer");
  }

  await UserDAO.update(session.user.did, { name: name || "" });
  return NextResponse.json({ ok: true, name: name || null });
});
