import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ActivityLogDAO, IntentDAO } from "@/db";
import {
  adminContract,
  type AuditEntry,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/admin/governance/audit — the audit slice of `adminContract.governance`.
 *
 * Returns a unified audit stream: activity_log + intent_log merged by
 * timestamp. Global admin only. The contract is the single source of truth for
 * the request/response shapes.
 */
const handlers = createNextRoute(adminContract.governance, {
  audit: async ({ query, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const limit = Math.min(500, Math.max(1, query.limit ?? 200));
    const source = query.source ?? "";
    const statusFilter = query.status ?? "";
    const agentDidFilter = query.agentDid ?? "";

    const entries: AuditEntry[] = [];

    // Activity log entries
    if (!source || source === "activity") {
      const activityRows = agentDidFilter
        ? await ActivityLogDAO.findByAgent(agentDidFilter, limit)
        : await ActivityLogDAO.findAll(limit);

      for (const r of activityRows) {
        entries.push({
          id: `act-${r.id}`,
          source: "activity",
          event: r.event,
          agentDid: r.agentDid,
          agentName: r.agentName,
          details: r.details,
          status: null,
          error: null,
          timestamp: r.createdAt.toISOString(),
        });
      }
    }

    // Intent log entries
    if (!source || source === "intent") {
      const intentRows = await IntentDAO.findAll(
        limit,
        agentDidFilter || undefined,
        undefined,
        statusFilter || undefined
      );

      for (const r of intentRows) {
        entries.push({
          id: `int-${r.intentId}`,
          source: "intent",
          event: r.action,
          agentDid: r.agentDid,
          agentName: null,
          details: r.params !== null ? JSON.stringify(r.params) : null,
          status: r.status,
          error: r.error,
          timestamp: r.sentAt.toISOString(),
        });
      }
    }

    // Sort merged result by timestamp desc, cap at limit
    entries.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    const result = entries.slice(0, limit);

    return {
      status: 200 as const,
      body: { entries: result, total: result.length },
    };
  },
});

export const GET = handlers.GET!;
