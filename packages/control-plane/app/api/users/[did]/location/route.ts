import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { UserDAO } from "@/db";

/**
 * PATCH /api/users/[did]/location
 * Set or clear the geographic location of a user. Admin-only.
 * Body: { lat: number, lon: number, label: string } or { lat: null } to clear.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const user = (await UserDAO.findByDid(did)) ?? (await UserDAO.findById(did));
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (body.lat === null || body.lat === undefined) {
    await UserDAO.updateLocation(user.id, null);
  } else {
    const lat = parseFloat(body.lat);
    const lon = parseFloat(body.lon);
    const label = String(body.label ?? "");
    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json(
        { error: "lat and lon must be valid numbers" },
        { status: 400 }
      );
    }
    await UserDAO.updateLocation(user.id, { lat, lon, label });
  }

  return NextResponse.json({ ok: true });
}
