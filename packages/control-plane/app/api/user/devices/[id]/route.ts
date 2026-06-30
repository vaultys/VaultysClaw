import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDeviceDAO } from "@/db";
import { notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/user/devices/[id]
 * Revoke (unlink) a linked VaultysId. Scoped to the current user.
 */
export const DELETE = withError(async (_request: NextRequest, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.userId) return unauthorized();

  const { id } = await params;
  const deleted = await UserDeviceDAO.deleteForUser(id, session.user.userId);
  if (!deleted) return notFound("Device not found");

  return NextResponse.json({ ok: true });
});
