import { NextRequest, NextResponse } from "next/server";
import { Challenger, VaultysId, crypto } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { getAgent } from "@/lib/db";

const Buffer = crypto.Buffer;

/**
 * Extract displayable VaultysId info from a public key buffer
 */
function vaultysIdInfo(pk: unknown) {
  if (!pk) return null;
  try {
    const vid = VaultysId.fromId(pk as Buffer).toVersion(1);
    return {
      did: vid.did,
      fingerprint: vid.fingerprint,
      version: vid.version,
      type: vid.isMachine() ? "machine" : vid.isPerson() ? "person" : vid.isHardware() ? "hardware" : "unknown",
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/agents/[did]
 * Get detailed info for a single agent by DID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  try {
    const { did: rawDid } = await params;
    const did = decodeURIComponent(rawDid);

    const agent = getAgent(did);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const wsServer = getWSServer();
    const connected = wsServer?.getAgent(did);

    // Deserialize certificate data
    let certificateInfo: Record<string, unknown> | null = null;
    let agentVaultysId: Record<string, unknown> | null = null;

    if (agent.certificate_data) {
      try {
        const certBuffer = Buffer.from(agent.certificate_data, "base64");
        const cert = Challenger.deserializeCertificate(certBuffer);

        certificateInfo = {
          version: cert.version,
          protocol: cert.protocol,
          service: cert.service,
          state: cert.state,
          timestamp: cert.timestamp,
          error: cert.error ?? null,
          metadata: cert.metadata,
          pk1: cert.pk1 ? cert.pk1.toString("base64") : null,
          pk2: cert.pk2 ? cert.pk2.toString("base64") : null,
          nonce: cert.nonce ? cert.nonce.toString("base64") : null,
          sign1: cert.sign1 ? cert.sign1.toString("base64") : null,
          sign2: cert.sign2 ? cert.sign2.toString("base64") : null,
        };

        // pk2 = agent (responder)
        agentVaultysId = vaultysIdInfo(cert.pk2);
      } catch {
        certificateInfo = {
          present: true,
          dataSize: agent.certificate_data.length,
          parseError: true,
        };
      }
    }

    return NextResponse.json({
      id: agent.did,
      name: agent.name,
      capabilities: JSON.parse(agent.capabilities),
      publicKey: agent.public_key,
      certificateInfo,
      agentVaultysId,
      registeredAt: agent.registered_at,
      lastSeen: agent.last_seen,
      online: !!connected,
      connectedAt: connected?.connectedAt?.toISOString() ?? null,
      lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch agent" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agents/[did]
 * Update an agent's capabilities. Triggers re-auth if the agent is online.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  try {
    const { did: rawDid } = await params;
    const did = decodeURIComponent(rawDid);

    const body = await request.json();
    const { capabilities } = body;

    if (!Array.isArray(capabilities)) {
      return NextResponse.json(
        { error: "capabilities must be an array" },
        { status: 400 }
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json(
        { error: "WebSocket server not available" },
        { status: 503 }
      );
    }

    const updated = wsServer.updateAgentCapabilities(did, capabilities);
    if (!updated) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, capabilities });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update capabilities" },
      { status: 500 }
    );
  }
}
