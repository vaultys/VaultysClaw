import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { DeviceLinkRequestDAO } from "@/db";
import { malformed, notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/user/devices/link/[id]/reject
 * The logged-in user declines a device-link request.
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

  await DeviceLinkRequestDAO.setStatus(id, "rejected", session.user.userId);
  return NextResponse.json({ ok: true });
});
