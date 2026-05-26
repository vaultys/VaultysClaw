import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { getAllAgents } from "@/lib/db";

/**
 * GET /api/agents/search?q=...
 * Search for agents by name or DID
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase() || "";

    const allAgents = getAllAgents();

    // Filter agents by name or DID match
    const matches = allAgents.filter((agent) => {
      const name = (agent.name || "").toLowerCase();
      const did = (agent.did || "").toLowerCase();
      return name.includes(query) || did.includes(query);
    });

    return NextResponse.json({
      agents: matches.slice(0, 20), // Limit to 20 results
    });
  } catch (err) {
    console.error("GET /api/agents/search error:", err);
    return NextResponse.json(
      { error: "Failed to search agents" },
      { status: 500 }
    );
  }
}
