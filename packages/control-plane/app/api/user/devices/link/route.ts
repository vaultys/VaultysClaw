import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { DeviceLinkRequestDAO } from "@/db";
import { malformed } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

const LINK_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * POST /api/user/devices/link
 * Start a device-link request: the caller (e.g. the CLI) submits its VaultysId
 * so a logged-in user can approve linking it to their profile via an invite URL.
 *
 * Public — possession of the returned id is the capability. Approval requires
 * an authenticated session.
 *
 * Body: { did: string, publicKey?: string, name?: string }
 * Returns: { id, status, expiresAt }
 */
export const POST = withError(async (request: NextRequest) => {
  const body = (await request.json()) as {
    did?: string;
    publicKey?: string;
    name?: string;
  };
  if (!body.did) return malformed("did is required");

  const id = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  const req = await DeviceLinkRequestDAO.create({
    id,
    did: body.did,
    publicKey: body.publicKey,
    name: body.name,
    expiresAt,
  });

  return NextResponse.json(
    { id: req.id, status: req.status, expiresAt: req.expiresAt.toISOString() },
    { status: 201 }
  );
});
