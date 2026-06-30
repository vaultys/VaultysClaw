import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDeviceDAO } from "@/db";
import { unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

/**
 * GET /api/user/devices
 * List the VaultysId identities linked to the current user.
 */
export const GET = withError(async (_request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.userId) return unauthorized();

  const devices = await UserDeviceDAO.listByUser(session.user.userId);
  return NextResponse.json({
    devices: devices.map((d) => ({
      id: d.id,
      did: d.did,
      name: d.name,
      createdAt: d.createdAt.toISOString(),
      lastUsedAt: d.lastUsedAt ? d.lastUsedAt.toISOString() : null,
    })),
  });
});
