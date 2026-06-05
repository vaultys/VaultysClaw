import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";

/**
 * POST /api/registrations/batch
 * Reject multiple pending registrations at once. Global admin only.
 * Body: { ids: string[], reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    const reason: string = body.reason ?? "Rejected by admin";

    if (ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WebSocket server not available" },
        { status: 503 }
      );
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        const ok = await wsServer.rejectRegistration(id, reason);
        return { id, ok };
      })
    );

    const rejected = results.filter((r) => r.ok).map((r) => r.id);
    const notFound = results.filter((r) => !r.ok).map((r) => r.id);

    return NextResponse.json({ rejected, notFound });
  } catch {
    return NextResponse.json(
      { error: "Failed to process batch rejection" },
      { status: 500 }
    );
  }
}
