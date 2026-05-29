import { NextResponse } from "next/server";

/**
 * GET /api/agents/[did]/peers - List agent peers/peer grants
 */
export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}

/**
 * POST /api/agents/[did]/peers - Create peer grant
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
