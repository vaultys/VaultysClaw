import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  malformed,
  notFound,
  successNoContent,
} from "@/lib/api-utils";
import { AgentDAO } from "@/db";

/**
 * PATCH /api/agents/[did]/location
 * Set or clear the geographic location of an agent. Admin-only.
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
    return malformed();
  }

  const agent = await AgentDAO.findByDid(did);
  if (!agent) {
    return notFound("Agent not found");
  }

  if (body.lat === null || body.lat === undefined) {
    await AgentDAO.updateLocation(did, null);
  } else {
    const lat = Number.parseFloat(body.lat);
    const lon = Number.parseFloat(body.lon);
    const label = String(body.label ?? "");
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return malformed("Invalid latitude or longitude");
    }
    await AgentDAO.updateLocation(did, { lat, lon, label });
  }

  return successNoContent();
}
