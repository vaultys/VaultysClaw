import { Challenger, crypto } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { AgentDAO } from "@/db";
import { enqueueNotification } from "@/lib/notification-queue";
import {
  VaultysIDInfo,
  vaultysIdInfo,
  type AgentCapability,
} from "@vaultysclaw/shared";
import { APIException } from "@/lib/api/utils/api-utils";
import { getAuthContext } from "@/lib/auth-utils";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { VaultysCertificate } from "@/types";

const Buffer = crypto.Buffer;

/**
 * Routes for /api/admin/agents/:did — the `:did`-level slice of `adminContract.agents`.
 *
 * The contract (lib/contracts/admin/agents/agents.contract.ts) is the single source of
 * truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it. This file
 * implements only the routes that live at this path (getAgent/updateAgent/
 * deleteAgent); the contract's other routes are served by their own route.ts.
 */
const handlers = createNextRoute(adminContract.agents, {
  // ── GET /api/admin/agents/:did ──────────────────────────────────────────
  getAgent: async ({ params }) => {
    const { did } = params;

    const agent = await AgentDAO.findByDid(did);
    if (!agent) {
      throw new APIException("NOT_FOUND", "Agent not found");
    }

    const wsServer = getWSServer();
    const connected = wsServer?.getAgent(did);

    // Deserialize certificate data.
    let certificateInfo: VaultysCertificate | null = null;
    let agentVaultysId: VaultysIDInfo | null = null;

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
          dataSize: agent.certificateData.length,
          parseError: true,
        };
      }
    }

    return {
      status: 200,
      body: {
        ...agent,
        certificateInfo,
        agentVaultysId,
        online: !!connected,
        connectedAt: connected?.connectedAt ?? null,
        lastHeartbeat: connected?.lastHeartbeat ?? null,
        reportedLlm: connected?.reportedLlm ?? null,
        transport: connected ? connected.transport : null,
      },
    };
  },

  // ── PATCH /api/agents/:did ──────────────────────────────────────────────
  updateAgent: async ({ params, body }) => {
    const { did } = params;
    const { capabilities, tokenBudgetDaily, tokenBudgetMonthly } = body;

    if (capabilities !== undefined) {
      const wsServer = getWSServer();
      if (!wsServer) {
        throw new APIException("UNAVAILABLE", "WebSocket server not available");
      }

      const updated = wsServer.updateAgentCapabilities(
        did,
        capabilities as AgentCapability[]
      );
      if (!updated) {
        throw new APIException("NOT_FOUND", "Agent not found");
      }
    }

    if (tokenBudgetDaily !== undefined || tokenBudgetMonthly !== undefined) {
      const agent = await AgentDAO.findByDid(did);
      if (!agent) {
        throw new APIException("NOT_FOUND", "Agent not found");
      }
      await AgentDAO.updateBudget(did, {
        ...(tokenBudgetDaily !== undefined ? { tokenBudgetDaily } : {}),
        ...(tokenBudgetMonthly !== undefined ? { tokenBudgetMonthly } : {}),
      });
    }

    const updated = await AgentDAO.findByDid(did);
    return {
      status: 200,
      body: {
        capabilities: updated
          ? Array.isArray(updated.capabilities)
            ? (updated.capabilities as string[])
            : []
          : null,
      },
    };
  },

  // ── DELETE /api/agents/:did ─────────────────────────────────────────────
  deleteAgent: async ({ params, request }) => {
    const { did } = params;
    const auth = await getAuthContext(request);

    const agent = await AgentDAO.findByDid(did);
    if (!agent) {
      throw new APIException("NOT_FOUND", "Agent not found");
    }

    // Disconnect agent from WebSocket server first.
    getWSServer()?.disconnectAgent(did);

    await AgentDAO.delete(did);
    console.log("Successfully deleted agent:", did);

    void enqueueNotification({
      eventType: "agent.deleted",
      data: { agentDid: did, agentName: agent.name, actorDid: auth.did },
    });

    return { status: 204, body: undefined };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
