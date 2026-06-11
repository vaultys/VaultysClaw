import { Challenger, VaultysId, crypto } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO } from "@/db";
import type { AgentCapability } from "@vaultysclaw/shared";
import { agentDetailContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const Buffer = crypto.Buffer;

/**
 * Extract displayable VaultysId info from a public key buffer.
 */
function vaultysIdInfo(pk: unknown): Record<string, unknown> | null {
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
 * Routes for /api/agents/:did, implemented against `agentDetailContract`.
 *
 * The contract (lib/contracts/agents.contract.ts) is the single source of
 * truth for request/response shapes; `createNextRoute` validates inputs and
 * type-checks every `{ status, body }` returned below against it. The matching
 * OpenAPI/Swagger doc can be generated from the same contract.
 */
const handlers = createNextRoute(agentDetailContract, {
  // ── GET /api/agents/:did ────────────────────────────────────────────────
  getAgent: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return {
        status: 401,
        body: { error: "Not authenticated", code: "UNAUTHORIZED" },
      };
    }

    const { did } = params;

    const agent = await AgentDAO.findByDid(did);
    if (!agent) {
      return {
        status: 404,
        body: { error: "Agent not found", code: "NOT_FOUND" },
      };
    }

    if (!(await auth.canAccessAgent(did))) {
      return { status: 403, body: { error: "Forbidden", code: "FORBIDDEN" } };
    }

    const wsServer = getWSServer();
    const connected = wsServer?.getAgent(did);

    // Deserialize certificate data.
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

    // Today's and this month's token usage from history.
    const todayBucket = new Date().toISOString().slice(0, 10);
    const monthBucket = new Date().toISOString().slice(0, 7);
    const { todayTokens, monthTokens } = await AgentDAO.getTokenBuckets(
      agent.did,
      todayBucket,
      monthBucket
    );

    const cfg = agent.llmConfig;
    const storedLlm =
      cfg && typeof cfg === "object" && !Array.isArray(cfg)
        ? {
            provider: String((cfg as Record<string, unknown>).provider ?? ""),
            model: String((cfg as Record<string, unknown>).model ?? ""),
          }
        : null;

    const transport = connected?.transport;

    // The WS server reports prompt/completion only; derive the total so the
    // response satisfies the contract's TokenUsageSchema.
    const liveUsage = connected?.tokenUsage ?? null;
    const tokenUsage = liveUsage
      ? {
          promptTokens: liveUsage.promptTokens,
          completionTokens: liveUsage.completionTokens,
          totalTokens: ("totalTokens" in liveUsage &&
          typeof liveUsage.totalTokens === "number"
            ? liveUsage.totalTokens
            : liveUsage.promptTokens + liveUsage.completionTokens) as number,
        }
      : null;

    return {
      status: 200,
      body: {
        id: agent.did,
        name: connected?.name ?? agent.name,
        capabilities: Array.isArray(agent.capabilities)
          ? (agent.capabilities as string[])
          : [],
        publicKey: agent.publicKey ?? null,
        certificateInfo,
        agentVaultysId,
        registeredAt: agent.registeredAt.toISOString(),
        lastSeen: agent.lastSeen.toISOString(),
        online: !!connected,
        connectedAt: connected?.connectedAt?.toISOString() ?? null,
        lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
        reportedLlm: connected?.reportedLlm ?? null,
        transport:
          transport === "ws" || transport === "peerjs" ? transport : null,
        storedLlm,
        tokenUsage,
        tokenBudgetDaily: agent.tokenBudgetDaily ?? null,
        tokenBudgetMonthly: agent.tokenBudgetMonthly ?? null,
        todayTokens,
        monthTokens,
        locationLat: agent.locationLat ?? null,
        locationLon: agent.locationLon ?? null,
        locationLabel: agent.locationLabel ?? null,
      },
    };
  },

  // ── PATCH /api/agents/:did ──────────────────────────────────────────────
  updateAgent: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return {
        status: 401,
        body: { error: "Not authenticated", code: "UNAUTHORIZED" },
      };
    }
    if (!auth.isGlobalAdmin) {
      return { status: 403, body: { error: "Forbidden", code: "FORBIDDEN" } };
    }

    const { did } = params;
    const { capabilities, tokenBudgetDaily, tokenBudgetMonthly } = body;

    if (capabilities !== undefined) {
      const wsServer = getWSServer();
      if (!wsServer) {
        return {
          status: 503,
          body: {
            error: "WebSocket server not available",
            code: "UNAVAILABLE",
          },
        };
      }

      const updated = wsServer.updateAgentCapabilities(
        did,
        capabilities as AgentCapability[]
      );
      if (!updated) {
        return {
          status: 404,
          body: { error: "Agent not found", code: "NOT_FOUND" },
        };
      }
    }

    if (tokenBudgetDaily !== undefined || tokenBudgetMonthly !== undefined) {
      const agent = await AgentDAO.findByDid(did);
      if (!agent) {
        return {
          status: 404,
          body: { error: "Agent not found", code: "NOT_FOUND" },
        };
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
    const auth = await getAuthContext(request);
    if (!auth) {
      return {
        status: 401,
        body: { error: "Not authenticated", code: "UNAUTHORIZED" },
      };
    }
    if (!auth.isGlobalAdmin) {
      return { status: 403, body: { error: "Forbidden", code: "FORBIDDEN" } };
    }

    const { did } = params;

    const agent = await AgentDAO.findByDid(did);
    if (!agent) {
      return {
        status: 404,
        body: { error: "Agent not found", code: "NOT_FOUND" },
      };
    }

    // Disconnect agent from WebSocket server first.
    getWSServer()?.disconnectAgent(did);

    await AgentDAO.delete(did);
    console.log("Successfully deleted agent:", did);

    return { status: 204, body: undefined };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
