import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { createPolicy, listPolicies } from "@/lib/db";
import type { AgentCapability } from "@vaultysclaw/shared";

/**
 * GET /api/policies
 * List all policies. Global admin only.
 * Query params: agentDid, realmId, includeExpired
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { searchParams } = new URL(request.url);
    const agentDid = searchParams.get("agentDid") ?? undefined;
    const realmId = searchParams.get("realmId") ?? undefined;
    const includeExpired = searchParams.get("includeExpired") === "true";
    const expiredOnly = searchParams.get("expiredOnly") === "true";

    const policies = listPolicies({ agentDid, realmId, includeExpired, expiredOnly });

    return NextResponse.json({
      policies: policies.map((p) => ({
        id: p.id,
        agentDid: p.agent_did,
        realmId: p.realm_id,
        capabilities: JSON.parse(p.capabilities),
        resourceLimits: p.resource_limits ? JSON.parse(p.resource_limits) : null,
        expiresAt: p.expires_at,
        createdBy: p.created_by,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch policies" }, { status: 500 });
  }
}

/**
 * POST /api/policies
 * Create and persist a new policy. Optionally push to agent via WebSocket. Global admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const body = await request.json();
    const { agentDid, realmId, capabilities, resourceLimits, expiresAt, broadcast } = body;

    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      return NextResponse.json({ error: "capabilities must be a non-empty array" }, { status: 400 });
    }

    const policy = createPolicy({
      agentDid: agentDid ?? undefined,
      realmId: realmId ?? undefined,
      capabilities,
      resourceLimits: resourceLimits ?? undefined,
      expiresAt: expiresAt ?? undefined,
      createdBy: auth.did,
    });

    // Apply via cert reissue so capabilities + limits are enforced immediately.
    const wsServer = getWSServer();
    const sentTo: string[] = [];

    if (wsServer && agentDid) {
      const policyMeta = {
        resourceLimits: resourceLimits ?? null,
        policyId: policy.id,
        policyExpiresAt: expiresAt ?? null,
      };
      const applied = wsServer.applyPolicy(agentDid, capabilities as AgentCapability[], policyMeta);
      if (applied) sentTo.push(agentDid);
    }

    return NextResponse.json(
      {
        policy: {
          id: policy.id,
          agentDid: policy.agent_did,
          realmId: policy.realm_id,
          capabilities: JSON.parse(policy.capabilities),
          resourceLimits: policy.resource_limits ? JSON.parse(policy.resource_limits) : null,
          expiresAt: policy.expires_at,
          createdBy: policy.created_by,
          createdAt: policy.created_at,
        },
        sentTo,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }
}
