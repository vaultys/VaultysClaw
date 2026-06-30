import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { DeviceLinkRequestDAO, UserDeviceDAO } from "@/db";
import { malformed, notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/user/devices/link/[id]/approve
 * The logged-in user approves linking the requested VaultysId to their profile.
 * Creates a UserDevice owned by the session user.
 */
export const POST = withError(async (_request: NextRequest, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.userId) return unauthorized();

  const { id } = await params;
  const req = await DeviceLinkRequestDAO.findById(id);
  if (!req) return notFound("Link request not found");

  if (req.status !== "pending") {
    return malformed(`Link request is already ${req.status}`);
  }
  if (req.expiresAt < new Date()) {
    return malformed("Link request has expired");
  }

  await UserDeviceDAO.create({
    id: crypto.randomBytes(16).toString("hex"),
    userId: session.user.userId,
    did: req.did,
    publicKey: req.publicKey,
    name: req.name,
  });
  await DeviceLinkRequestDAO.setStatus(id, "approved", session.user.userId);

  return NextResponse.json({ ok: true });
});
