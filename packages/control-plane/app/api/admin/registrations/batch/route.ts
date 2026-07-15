import { getWSServer } from "@/lib/ws-server";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.registrations, {
  // ── POST /api/admin/registrations/batch — reject many at once ───────────────────
  batchReject: async ({ body }) => {

    const ids = body.ids;
    const reason = body.reason ?? "Rejected by admin";
    if (ids.length === 0) throw new APIException("MALFORMED", "No ids provided");

    const wsServer = getWSServer();
    if (!wsServer) {
      throw new APIException("UNAVAILABLE", "WebSocket server not available");
    }

    const results = await Promise.all(
      ids.map(async (id) => ({
        id,
        ok: await wsServer.rejectRegistration(id, reason),
      }))
    );

    return {
      status: 200,
      body: {
        rejected: results.filter((r) => r.ok).map((r) => r.id),
        notFound: results.filter((r) => !r.ok).map((r) => r.id),
      },
    };
  },
});

export const POST = handlers.POST!;
