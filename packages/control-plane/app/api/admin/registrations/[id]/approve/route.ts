import { getWSServer } from "@/lib/ws-server";
import type { AgentCapability } from "@vaultysclaw/shared";
import { APIException } from "@/lib/api/utils/api-utils";
import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO, PendingRegistrationDAO, ProxyDAO, WorkspaceDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.registrations, {
  // ── POST /api/admin/registrations/:id/approve ───────────────────────────────────
  approve: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const workspaceIds = body.workspaceIds ?? [];

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

    let capabilities = (body.capabilities ?? []) as AgentCapability[];

    // For user-initiated (enrollment) agents where the admin didn't pick any
    // capabilities, default to the target personal workspace's
    // defaultCapabilities — the admin can still override by sending their own.
    if (capabilities.length === 0 && registration.targetWorkspaceId) {
      const targetWorkspace = await WorkspaceDAO.findById(
        registration.targetWorkspaceId
      );
      capabilities = ((targetWorkspace?.defaultCapabilities as
        | string[]
        | undefined) ?? []) as AgentCapability[];
    }

    // A proxy's own connection isn't capability-gated (governance lives on
    // its principals, configured separately) — only agents require a
    // capability to be assigned before approval.
    if (capabilities.length === 0 && registration.kind !== "proxy") {
      throw new APIException(
        "MALFORMED",
        "At least one capability must be assigned"
      );
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      throw new APIException("UNAVAILABLE", "WebSocket server not available");
    }

    const success = await wsServer.approveRegistration(
      params.id,
      capabilities,
      auth.did
    );
    if (!success) {
      throw new APIException("UNAVAILABLE", "Failed to approve registration");
    }

    // A proxy has no workspace/capability concept of its own — resolve its
    // DID via ProxyDAO instead, and skip agent-only workspace enrollment.
    if (registration.kind === "proxy") {
      const proxyRow = await ProxyDAO.findByName(registration.agentName);
      return {
        status: 200,
        body: {
          success: true,
          registrationId: params.id,
          capabilities: [],
          agentDid: proxyRow?.did ?? null,
        },
      };
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
