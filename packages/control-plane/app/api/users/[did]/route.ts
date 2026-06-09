/**
 * GET    /api/users/[did]  — Get a single user (admin-only).
 * DELETE /api/users/[did]  — Remove a user and all their grants (owner-only).
 * PATCH  /api/users/[did]  — Update a user's profile fields (owner-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { GrantDAO, UserDAO } from "@/db";
import { forbidden, malformed, notFound } from "@/lib/api/utils/api-utils";

const VALID_ROLES = [
  "owner",
  "admin",
  "manager",
  "operator",
  "member",
] as const;
type ValidRole = (typeof VALID_ROLES)[number];

/**
 * @openapi
 * /api/users/{did}:
 *   get:
 *     summary: Get a single user by DID.
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the user to retrieve.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A user object.
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
 *                 email:
 *                   type: string
 *                   nullable: true
 *                 isOwner:
 *                   type: boolean
 *                 isAdmin:
 *                   type: boolean
 *                 role:
 *                   type: string
 *                 reportsTo:
 *                   type: string
 *                   nullable: true
 *                 description:
 *                   type: string
 *                   nullable: true
 *                 registeredAt:
 *                   type: string
 *                   format: date-time
 *                 grants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       agentDid:
 *                         type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *                       grantedBy:
 *                         type: string
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return forbidden();
  }

  const { did } = await params;

  const user = (await UserDAO.findByDid(did)) ?? (await UserDAO.findById(did));
  if (!user) {
    return notFound("User not found");
  }

  const grants = user.did
    ? await GrantDAO.listByUser(user.did).catch(() => [])
    : [];

  return NextResponse.json({
    id: user.id,
    did: user.did,
    name: user.name ?? null,
    email: user.email ?? null,
    isOwner: user.isOwner,
    isAdmin: user.isAdmin || user.isOwner,
    role: user.role ?? "member",
    reportsTo: user.reportsTo ?? null,
    description: user.description ?? null,
    registeredAt: user.registeredAt,
    grants: (
      grants as Array<{
        id: string;
        agentDid: string | null;
        capabilities: unknown;
        grantedBy: string;
        expiresAt: Date | null;
        createdAt: Date;
      }>
    ).map((g) => ({
      id: g.id,
      agentDid: g.agentDid,
      capabilities: g.capabilities as string[],
      grantedBy: g.grantedBy,
      expiresAt: g.expiresAt,
      createdAt: g.createdAt,
    })),
  });
}

/**
 * @openapi
 * /api/users/{did}:
 *   delete:
 *     summary: Remove a user and all their grants (owner-only).
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the user to be removed.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User successfully removed.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isOwner) {
    return forbidden();
  }

  const { did } = await params;

  if (did === session.user.did) {
    return forbidden("Cannot remove yourself");
  }

  const user = await UserDAO.findByDid(did);
  if (!user) {
    return notFound("User not found");
  }

  await UserDAO.delete(user.id);
  return NextResponse.json({ ok: true });
}

/**
 * @openapi
 * /api/users/{did}:
 *   patch:
 *     summary: Update a user's profile fields.
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the user to update.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: ["owner", "admin", "manager", "operator", "member"]
 *               reportsTo:
 *                 type: string
 *                 nullable: true
 *               description:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: User profile updated successfully.
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
    return forbidden();
  }

  const { did } = await params;
  const user = await UserDAO.findByDid(did);
  if (!user) {
    return notFound("User not found");
  }

  const body = (await req.json()) as {
    name?: string;
    email?: string;
    role?: string;
    reportsTo?: string | null;
    description?: string | null;
  };

  const fields: Parameters<typeof UserDAO.update>[1] = {};
  if (typeof body.name === "string") fields.name = body.name.trim();
  if (typeof body.email === "string") fields.email = body.email.trim();
  if (typeof body.description === "string" || body.description === null) {
    fields.description =
      typeof body.description === "string" ? body.description.trim() : null;
  }
  if (typeof body.role === "string") {
    if (!VALID_ROLES.includes(body.role as ValidRole)) {
      return malformed("Invalid role");
    }
    if (!user.isOwner) fields.role = body.role;
  }
  if ("reportsTo" in body) {
    if (body.reportsTo === null || body.reportsTo === "") {
      fields.reportsTo = null;
    } else if (typeof body.reportsTo === "string") {
      if (body.reportsTo === did) {
        return forbidden("User cannot report to themselves");
      }
      const supervisor = await UserDAO.findByDid(body.reportsTo);
      if (!supervisor) {
        return notFound("Supervisor user not found");
      }
      fields.reportsTo = body.reportsTo;
    }
  }

  await UserDAO.update(user.id, fields);
  return NextResponse.json({ ok: true });
}
