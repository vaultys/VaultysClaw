import { NextRequest, NextResponse } from "next/server";
import { AgentPeerGrantDao } from "@/lib/agent-peer-grant-dao";
import { getAgent } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";

/**
 * DELETE /api/agents/[did]/peers/[grantId]
 * Revoke a specific peer grant.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ did: string; grantId: string }> },
) {
  try {
    const { did: rawDid, grantId } = await params;
    const sourceDid = decodeURIComponent(rawDid);

    const agent = getAgent(sourceDid);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const grant = AgentPeerGrantDao.getById(grantId);
    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }
    if (grant.source_did !== sourceDid) {
      return NextResponse.json({ error: "Grant does not belong to this agent" }, { status: 403 });
    }

    AgentPeerGrantDao.delete(grantId);

    // Push updated (empty or reduced) peer catalog to the source agent if connected
    getWSServer()?.pushPeerCatalog(sourceDid);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/agents/[did]/peers/[grantId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
