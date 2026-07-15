import { getWSServer } from "@/lib/ws-server";
import type { AgentCapability } from "@vaultysclaw/shared";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, PendingRegistrationDAO, WorkspaceDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.registrations, {
  // ── POST /api/admin/registrations/:id/approve ───────────────────────────────────
  approve: async ({ params, body }) => {

    const capabilities = (body.capabilities ?? []) as AgentCapability[];
    const workspaceIds = body.workspaceIds ?? [];

    if (capabilities.length === 0) {
      throw new APIException(
        "MALFORMED",
        "At least one capability must be assigned"
      );
    }

    const registration = await PendingRegistrationDAO.findById(params.id);
    if (!registration) {
      throw new APIException("NOT_FOUND", "Registration not found");
    }
    if (registration.status !== "pending") {
      throw new APIException(
        "CONFLICT",
        `Registration already ${registration.status}`
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      throw new APIException("UNAVAILABLE", "WebSocket server not available");
    }

    const success = await wsServer.approveRegistration(params.id, capabilities);
    if (!success) {
      throw new APIException("UNAVAILABLE", "Failed to approve registration");
    }

    const agentRow = await AgentDAO.findByName(registration.agentName);

    // Enroll the agent in any additional selected workspaces (the default workspace is
    // already enrolled by the ws-server during approval).
    if (workspaceIds.length > 0 && agentRow?.did) {
      const allWorkspaces = await WorkspaceDAO.findAll();
      const defaultWorkspace = allWorkspaces.find((r) => r.isDefault);
      for (const rid of workspaceIds) {
        if (defaultWorkspace && rid === defaultWorkspace.id) continue;
        try {
          await AgentDAO.addToWorkspace(agentRow.did, rid, false);
        } catch {
          /* already a member */
        }
      }
    }

    return {
      status: 200,
      body: {
        success: true,
        registrationId: params.id,
        capabilities,
        agentDid: agentRow?.did ?? null,
      },
    };
  },
});

export const POST = handlers.POST!;
