import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { PendingRegistrationDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.registrations, {
  // ── POST /api/registrations/:id/reject ────────────────────────────────────
  reject: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const reason = body.reason ?? "Registration rejected by admin";

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

    const success = await wsServer.rejectRegistration(params.id, reason);
    if (!success) {
      throw new APIException(
        "UNAVAILABLE",
        "Agent connection no longer available"
      );
    }

    return { status: 200, body: { success: true, registrationId: params.id } };
  },
});

export const POST = handlers.POST!;
