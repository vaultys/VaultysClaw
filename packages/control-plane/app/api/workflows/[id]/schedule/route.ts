import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { nextCronRun } from "@/lib/workflow-scheduler";
import { WorkflowDAO } from "@/db";
import { workflowsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/workflows/:id/schedule — get / set / clear a cron schedule.
 */
const handlers = createNextRoute(workflowsContract, {
  // ── GET ─────────────────────────────────────────────────────────────────
  getSchedule: async ({ params, request }) => {
    await getAuthContext(request);

    const wf = await WorkflowDAO.findById(params.id);
    if (!wf) throw new APIException("NOT_FOUND", "Workflow not found");

    return {
      status: 200,
      body: {
        workflowId: params.id,
        scheduleCron: wf.scheduleCron,
        scheduleEnabled: Boolean(wf.scheduleEnabled),
        scheduleLastRun: wf.scheduleLastRun,
        scheduleNextRun: wf.scheduleNextRun,
      },
    };
  },

  // ── POST ────────────────────────────────────────────────────────────────
  setSchedule: async ({ params, body, request }) => {
    await getAuthContext(request);

    const wf = await WorkflowDAO.findById(params.id);
    if (!wf) throw new APIException("NOT_FOUND", "Workflow not found");

    const cron = body.cron ?? null;
    const enabled = body.enabled !== false; // default true when setting

    if (cron && cron.trim().split(/\s+/).length !== 5) {
      throw new APIException(
        "MALFORMED",
        "Invalid cron expression (expected 5 fields)"
      );
    }

    const nextRun = cron ? (nextCronRun(cron)?.toISOString() ?? null) : null;
    await WorkflowDAO.setSchedule(params.id, cron, enabled, nextRun);

    return {
      status: 200,
      body: {
        success: true,
        scheduleCron: cron,
        scheduleEnabled: enabled,
        scheduleNextRun: nextRun,
      },
    };
  },

  // ── DELETE ──────────────────────────────────────────────────────────────
  clearSchedule: async ({ params, request }) => {
    await getAuthContext(request);

    const wf = await WorkflowDAO.findById(params.id);
    if (!wf) throw new APIException("NOT_FOUND", "Workflow not found");

    await WorkflowDAO.setSchedule(params.id, null, false, null);
    return { status: 200, body: { success: true } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;
