import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/db";
import { AgentPeerGrantDao } from "@/lib/agent-peer-grant-dao";
import { signPeerGrant } from "@/lib/peer-grant";
import { getWSServer } from "@/lib/ws-server";

/**
 * GET /api/agents/[did]/peers
 * List all outgoing peer grants for an agent (grants where this agent is the caller).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  try {
    const { did: rawDid } = await params;
    const sourceDid = decodeURIComponent(rawDid);

    const agent = getAgent(sourceDid);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const grants = AgentPeerGrantDao.listBySource(sourceDid);
    return NextResponse.json({
      grants: grants.map((g) => ({
        id: g.id,
        sourceDid: g.source_did,
        targetDid: g.target_did,
        targetName: g.target_name,
        skillDescription: g.skill_description,
        capabilities: JSON.parse(g.capabilities) as string[],
        expiresAt: g.expires_at ?? undefined,
        createdAt: g.created_at,
      })),
    });
  } catch (err) {
    console.error("GET /api/agents/[did]/peers error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/agents/[did]/peers
 * Create a new peer grant authorising this agent to call a remote agent.
 *
 * Body: { targetDid: string, targetName: string, skillDescription: string, capabilities?: string[], expiresAt?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  try {
    const { did: rawDid } = await params;
    const sourceDid = decodeURIComponent(rawDid);

    const agent = getAgent(sourceDid);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json() as {
      targetDid?: string;
      targetName?: string;
      skillDescription?: string;
      capabilities?: string[];
      expiresAt?: string;
    };

    const { targetDid, targetName, skillDescription, capabilities = [], expiresAt } = body;

    if (!targetDid || typeof targetDid !== "string") {
      return NextResponse.json({ error: "targetDid is required" }, { status: 400 });
    }
    if (!targetName || typeof targetName !== "string") {
      return NextResponse.json({ error: "targetName is required" }, { status: 400 });
    }
    if (!skillDescription || typeof skillDescription !== "string") {
      return NextResponse.json({ error: "skillDescription is required" }, { status: 400 });
    }

    const expiresAtDate = expiresAt ? new Date(expiresAt) : undefined;

    // Sign the peer grant with the server's identity
    const certificate = await signPeerGrant(
      sourceDid,
      targetDid,
      targetName,
      skillDescription,
      capabilities,
      expiresAtDate,
    );

    const grant = AgentPeerGrantDao.create({
      source_did: sourceDid,
      target_did: targetDid,
      target_name: targetName,
      skill_description: skillDescription,
      capabilities: JSON.stringify(capabilities),
      certificate,
      expires_at: expiresAtDate?.toISOString() ?? null,
    });

    // Push updated peer catalog to the source agent if connected
    getWSServer()?.pushPeerCatalog(sourceDid);

    return NextResponse.json({
      grant: {
        id: grant.id,
        sourceDid: grant.source_did,
        targetDid: grant.target_did,
        targetName: grant.target_name,
        skillDescription: grant.skill_description,
        capabilities: JSON.parse(grant.capabilities) as string[],
        expiresAt: grant.expires_at ?? undefined,
        createdAt: grant.created_at,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/agents/[did]/peers error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
