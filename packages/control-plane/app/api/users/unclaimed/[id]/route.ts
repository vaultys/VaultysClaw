/**
 * GET    /api/users/unclaimed/[id]  — Get an unclaimed Entra user by internal ID.
 * PATCH  /api/users/unclaimed/[id]  — Update profile fields.
 * DELETE /api/users/unclaimed/[id]  — Remove the user.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { RealmDAO, UserDAO } from "@/db";
import { forbidden, malformed, notFound } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

const VALID_ROLES = [
  "owner",
  "admin",
  "manager",
  "operator",
  "member",
] as const;
type ValidRole = (typeof VALID_ROLES)[number];

type Ctx = { params: Promise<{ id: string }> };

/**
 * @openapi
 * /api/users/unclaimed/{id}:
 *   get:
 *     summary: Get an unclaimed Entra user by internal ID.
 *     tags: [Users]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The internal ID of the unclaimed user.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved the unclaimed user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 did:
 *                   type: string
 *                   nullable: true
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
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
 *                 entraId:
 *                   type: string
 *                   nullable: true
 *                 claimedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 realms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       color:
 *                         type: string
 *                       isPrimary:
 *                         type: boolean
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const GET = withError(async (_req: NextRequest, { params }: Ctx) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return forbidden();
  }

  const { id } = await params;
  const user = await UserDAO.findById(id);
  if (!user || user.did) {
    // Not found or already claimed — redirect callers to the normal route
    return notFound("User not found or already claimed");
  }

  const realms = await RealmDAO.getUserRealms(user.id);

  return NextResponse.json({
    id: user.id,
    did: user.did,
    name: user.name,
    email: user.email,
    isOwner: user.isOwner,
    isAdmin: user.isAdmin || user.isOwner,
    role: user.role ?? "member",
    reportsTo: user.reportsTo ?? null,
    description: user.description ?? null,
    registeredAt: user.registeredAt,
    entraId: user.entraId ?? null,
    claimedAt: user.claimedAt ?? null,
    realms: realms.map((r) => ({
      id: r.realmId,
      name: r.realm.name,
      slug: r.realm.slug,
      color: r.realm.color,
      isPrimary: Boolean(r.isPrimary),
    })),
  });
});

/**
 * @openapi
 * /api/users/unclaimed/{id}:
 *   patch:
 *     summary: Update profile fields of an unclaimed user.
 *     tags: [Users]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Internal ID of the unclaimed user
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
 *         description: Profile fields updated successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const PATCH = withError(async (req: NextRequest, { params }: Ctx) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return forbidden();
  }

  const { id } = await params;
  const user = await UserDAO.findById(id);
  if (!user || user.did) {
    return notFound("User not found or already claimed");
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
    fields.role = body.role;
  }
  if ("reportsTo" in body) {
    fields.reportsTo = body.reportsTo || null;
  }

  await UserDAO.update(user.id, fields);
  return NextResponse.json({ ok: true });
});

/**
 * @openapi
 * /api/users/unclaimed/{id}:
 *   delete:
 *     summary: Remove an unclaimed user by internal ID.
 *     tags: [Users]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The internal ID of the unclaimed user.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User successfully removed.
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export const DELETE = withError(async (_req: NextRequest, { params }: Ctx) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return forbidden();
  }

  const { id } = await params;
  const user = await UserDAO.findById(id);
  if (!user || user.did) {
    return notFound("User not found or already claimed");
  }

  await UserDAO.delete(id);
  return NextResponse.json({ ok: true });
});
