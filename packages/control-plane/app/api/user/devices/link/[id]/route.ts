import { NextRequest, NextResponse } from "next/server";
import { DeviceLinkRequestDAO } from "@/db";
import { notFound } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/user/devices/link/[id]
 * Poll a device-link request (used by the CLI) and render it on the approval
 * page. Public — the id is the capability. Reports "expired" past its TTL.
 */
export const GET = withError(async (_request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const req = await DeviceLinkRequestDAO.findById(id);
  if (!req) return notFound("Link request not found");

  const expired = req.status === "pending" && req.expiresAt < new Date();
  return NextResponse.json({
    id: req.id,
    status: expired ? "expired" : req.status,
    name: req.name,
    did: req.did,
    expiresAt: req.expiresAt.toISOString(),
  });
});
