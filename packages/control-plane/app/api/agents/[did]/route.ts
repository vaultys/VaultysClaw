import { NextRequest, NextResponse } from "next/server";
import { Challenger, VaultysId, crypto } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { getAgent, updateAgentBudget, getDb } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

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
 * Get detailed info for a single agent by DID. Requires auth and realm membership.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { did: rawDid } = await params;
    const did = decodeURIComponent(rawDid);

    const agent = getAgent(did);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (!auth.canAccessAgent(did)) return forbidden();

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

    // Today's and this month's token usage from history
    const db = getDb();
    const todayBucket = new Date().toISOString().slice(0, 10);
    const monthBucket = new Date().toISOString().slice(0, 7);
    const todayRow = db.prepare(
      "SELECT prompt_tokens + completion_tokens AS total FROM agent_token_usage_history WHERE agent_did = ? AND granularity = 'day' AND bucket = ?"
    ).get(agent.did, todayBucket) as { total: number } | undefined;
    const monthRow = db.prepare(
      "SELECT prompt_tokens + completion_tokens AS total FROM agent_token_usage_history WHERE agent_did = ? AND granularity = 'month' AND bucket = ?"
    ).get(agent.did, monthBucket) as { total: number } | undefined;

    return NextResponse.json({
      id: agent.did,
      name: connected?.name ?? agent.name,
      capabilities: JSON.parse(agent.capabilities),
      publicKey: agent.public_key,
      certificateInfo,
      agentVaultysId,
      registeredAt: agent.registered_at,
      lastSeen: agent.last_seen,
      online: !!connected,
      connectedAt: connected?.connectedAt?.toISOString() ?? null,
      lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
      reportedLlm: connected?.reportedLlm ?? null,
      tokenUsage: connected?.tokenUsage ?? null,
      tokenBudgetDaily: agent.token_budget_daily ?? null,
      tokenBudgetMonthly: agent.token_budget_monthly ?? null,
      todayTokens: todayRow?.total ?? 0,
      monthTokens: monthRow?.total ?? 0,
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
 * Update an agent's capabilities. Global admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { did: rawDid } = await params;
    const did = decodeURIComponent(rawDid);

    const body = await request.json();
    const { capabilities, tokenBudgetDaily, tokenBudgetMonthly } = body;

    if (capabilities !== undefined) {
      if (!Array.isArray(capabilities)) {
        return NextResponse.json({ error: "capabilities must be an array" }, { status: 400 });
      }

      const wsServer = getWSServer();
      if (!wsServer) {
        return NextResponse.json({ error: "WebSocket server not available" }, { status: 503 });
      }

      const updated = wsServer.updateAgentCapabilities(did, capabilities);
      if (!updated) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
    }

    if (tokenBudgetDaily !== undefined || tokenBudgetMonthly !== undefined) {
      const agent = getAgent(did);
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      updateAgentBudget(did, {
        tokenBudgetDaily: tokenBudgetDaily === null ? null : (typeof tokenBudgetDaily === "number" ? tokenBudgetDaily : undefined),
        tokenBudgetMonthly: tokenBudgetMonthly === null ? null : (typeof tokenBudgetMonthly === "number" ? tokenBudgetMonthly : undefined),
      });
    }

    const updated = getAgent(did);
    return NextResponse.json({ success: true, capabilities: updated ? JSON.parse(updated.capabilities) : undefined });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update capabilities" },
      { status: 500 }
    );
  }
}
