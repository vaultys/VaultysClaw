/**
 * POST /api/server/entra/sync
 * Trigger a user sync from Microsoft Entra ID.
 * Admin-only.
 *
 * Body:
 *   groupIds       string[]              Entra group IDs to import (empty = all users)
 *   groupRealmMap  Record<string,string> Map from group ID → realm ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { syncEntraUsers } from "@/lib/entra-sync";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    groupIds?: string[];
    groupRealmMap?: Record<string, string>;
    groupNames?: Record<string, string>;
  };

  try {
    const result = await syncEntraUsers({
      groupIds: body.groupIds ?? [],
      groupRealmMap: body.groupRealmMap ?? {},
      groupNames: body.groupNames ?? {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 502 },
    );
  }
}
