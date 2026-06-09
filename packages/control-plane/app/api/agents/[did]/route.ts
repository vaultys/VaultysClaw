import { NextRequest, NextResponse } from "next/server";
import { Challenger, VaultysId, crypto } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
  unavailable,
  successNoContent,
} from "@/lib/api/utils/api-utils";
import { AgentDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

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
      type: vid.isMachine()
        ? "machine"
        : vid.isPerson()
          ? "person"
          : vid.isHardware()
            ? "hardware"
            : "unknown",
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/agents/[did]
 * Get detailed info for a single agent by DID. Requires auth and realm membership.
 */
/**
 * @openapi
 * /api/agent/{did}:
 *   get:
 *     summary: Get detailed info for a single agent by DID.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the agent.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed information about the agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 capabilities:
 *                   type: array
 *                   items:
 *                     type: string
 *                 publicKey:
 *                   type: string
 *                 certificateInfo:
 *                   type: object
 *                 agentVaultysId:
 *                   type: object
 *                 registeredAt:
 *                   type: string
 *                   format: date-time
 *                 lastSeen:
 *                   type: string
 *                   format: date-time
 *                 online:
 *                   type: boolean
 *                 connectedAt:
 *                   type: string
 *                   format: date-time
 *                 lastHeartbeat:
 *                   type: string
 *                   format: date-time
 *                 reportedLlm:
 *                   type: string
 *                 transport:
 *                   type: string
 *                 storedLlm:
 *                   type: object
 *                 tokenUsage:
 *                   type: object
 *                 tokenBudgetDaily:
 *                   type: integer
 *                 tokenBudgetMonthly:
 *                   type: integer
 *                 todayTokens:
 *                   type: integer
 *                 monthTokens:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch agent.
 */
export const GET = withError(async (
  _request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) => {
  const auth = await getAuthContext(_request);
  if (!auth) return unauthorized();

  const { did: rawDid } = await params;
  const did = decodeURIComponent(rawDid);

  const agent = await AgentDAO.findByDid(did);
  if (!agent) {
    return notFound("Agent not found");
  }

  if (!(await auth.canAccessAgent(did))) return forbidden();

  const wsServer = getWSServer();
  const connected = wsServer?.getAgent(did);

  // Deserialize certificate data
  let certificateInfo: Record<string, unknown> | null = null;
  let agentVaultysId: Record<string, unknown> | null = null;

  if (agent.certificateData) {
    try {
      const certBuffer = Buffer.from(agent.certificateData, "base64");
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
        dataSize: agent.certificateData.length,
        parseError: true,
      };
    }
  }

  // Today's and this month's token usage from history
  const todayBucket = new Date().toISOString().slice(0, 10);
  const monthBucket = new Date().toISOString().slice(0, 7);
  const { todayTokens, monthTokens } = await AgentDAO.getTokenBuckets(
    agent.did,
    todayBucket,
    monthBucket
  );

  return NextResponse.json({
    id: agent.did,
    name: connected?.name ?? agent.name,
    capabilities: agent.capabilities,
    publicKey: agent.publicKey,
    certificateInfo,
    agentVaultysId,
    registeredAt: agent.registeredAt,
    lastSeen: agent.lastSeen,
    online: !!connected,
    connectedAt: connected?.connectedAt?.toISOString() ?? null,
    lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
    reportedLlm: connected?.reportedLlm ?? null,
    transport: connected?.transport ?? null,
    storedLlm: (() => {
      try {
        const cfg = agent.llmConfig ? agent.llmConfig : null;
        return cfg && typeof cfg === "object" && !Array.isArray(cfg)
          ? {
              provider: String(cfg.provider ?? ""),
              model: String(cfg.model ?? ""),
            }
          : null;
      } catch {
        return null;
      }
    })(),
    tokenUsage: connected?.tokenUsage ?? null,
    tokenBudgetDaily: agent.tokenBudgetDaily ?? null,
    tokenBudgetMonthly: agent.tokenBudgetMonthly ?? null,
    todayTokens,
    monthTokens,
    locationLat: agent.locationLat ?? null,
    locationLon: agent.locationLon ?? null,
    locationLabel: agent.locationLabel ?? null,
  });
});

/**
 * PATCH /api/agents/[did]
 * Update an agent's capabilities. Global admin only.
 */
/**
 * @openapi
 * /api/agent/{did}:
 *   patch:
 *     summary: Update an agent's capabilities.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the agent to update.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               capabilities:
 *                 type: array
 *                 items:
 *                   type: string
 *               tokenBudgetDaily:
 *                 type: number
 *                 nullable: true
 *               tokenBudgetMonthly:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Agent capabilities updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 capabilities:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to update capabilities.
 */
export const PATCH = withError(async (
  request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did: rawDid } = await params;
  const did = decodeURIComponent(rawDid);

  const body = await request.json();
  const { capabilities, tokenBudgetDaily, tokenBudgetMonthly } = body;

  if (capabilities !== undefined) {
    if (!Array.isArray(capabilities)) {
      return malformed("capabilities must be an array of strings");
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      return unavailable("WebSocket server not available");
    }

    const updated = wsServer.updateAgentCapabilities(did, capabilities);
    if (!updated) {
      return notFound("Agent not found");
    }
  }

  if (tokenBudgetDaily !== undefined || tokenBudgetMonthly !== undefined) {
    const agent = await AgentDAO.findByDid(did);
    if (!agent) {
      return notFound("Agent not found");
    }
    await AgentDAO.updateBudget(did, {
      tokenBudgetDaily:
        tokenBudgetDaily === null
          ? null
          : typeof tokenBudgetDaily === "number"
            ? tokenBudgetDaily
            : undefined,
      tokenBudgetMonthly:
        tokenBudgetMonthly === null
          ? null
          : typeof tokenBudgetMonthly === "number"
            ? tokenBudgetMonthly
            : undefined,
    });
  }

  const updated = await AgentDAO.findByDid(did);
  return NextResponse.json({
    capabilities: updated ? updated.capabilities : undefined,
  });
});

/**
 * DELETE /api/agents/[did]
 * Delete an agent. Global admin only.
 */
/**
 * @openapi
 * /api/agent/{did}:
 *   delete:
 *     summary: Delete an agent.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the agent to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent successfully deleted.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to delete agent.
 */
export const DELETE = withError(async (
  _request: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) => {
  const auth = await getAuthContext(_request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did: rawDid } = await params;
  const did = decodeURIComponent(rawDid);

  const agent = await AgentDAO.findByDid(did);
  if (!agent) {
    return notFound("Agent not found");
  }

  // Disconnect agent from WebSocket server
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.disconnectAgent(did);
  }

  try {
    await AgentDAO.delete(did);
    console.log("Successfully deleted agent:", did);
  } catch (deleteError) {
    console.error("Error in deleteAgent:", deleteError);
    throw deleteError;
  }

  return successNoContent();
});
