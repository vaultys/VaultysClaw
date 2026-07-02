import { NextResponse } from "next/server";

/**
 * Temporary placeholder for the user-facing agents API.
 *
 * Lives in the `(user)` route group so the path resolves to `/api/agents`
 * (the group name is stripped). The user-scoped endpoints (contract in
 * `lib/contracts/user/agents`) are not implemented yet — the admin API is at
 * `/api/admin/agents`. Returns 501 until the real handlers land.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented", code: "NOT_IMPLEMENTED" },
    { status: 501 }
  );
}
