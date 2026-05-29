import { NextResponse } from "next/server";

/**
 * GET /api/agents/[did]/peers/[grantId] - Get peer grant details
 */
export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}

/**
 * DELETE /api/agents/[did]/peers/[grantId] - Revoke peer grant
 */
export async function DELETE() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
