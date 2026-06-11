/**
 * GET   /api/users/me — Return the current user's profile.
 * PATCH /api/users/me — Update the current user's own editable fields.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDAO } from "@/db";
import { malformed, notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

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
    id: user.id,
    did: user.did,
    publicKey: user.publicKey ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    description: user.description ?? null,
    role: user.role,
    isOwner: user.isOwner,
    isAdmin: user.isAdmin || user.isOwner,
    entraId: user.entraId ?? null,
    locationLabel: user.locationLabel ?? null,
    registeredAt: user.registeredAt,
    claimedAt: user.claimedAt ?? null,
  });
});

export const PATCH = withError(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return unauthorized();
  }

  const body = (await req.json()) as { name?: unknown; email?: unknown; description?: unknown };

  const update: Record<string, string | null> = {};

  if ("name" in body) {
    if (typeof body.name !== "string") return malformed("name must be a string");
    const name = body.name.trim();
    if (name.length > 128) return malformed("name must be 128 characters or fewer");
    update.name = name || null;
  }

  if ("email" in body) {
    if (body.email !== null && typeof body.email !== "string") return malformed("email must be a string or null");
    const email = typeof body.email === "string" ? body.email.trim() : null;
    update.email = email || null;
  }

  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") return malformed("description must be a string or null");
    const desc = typeof body.description === "string" ? body.description.trim() : null;
    if (desc && desc.length > 500) return malformed("description must be 500 characters or fewer");
    update.description = desc || null;
  }

  if (Object.keys(update).length === 0) return malformed("No updatable fields provided");

  await UserDAO.update(session.user.did, update);

  const user = await UserDAO.findByDid(session.user.did);
  return NextResponse.json({
    ok: true,
    name: user?.name ?? null,
    email: user?.email ?? null,
    description: user?.description ?? null,
  });
});
