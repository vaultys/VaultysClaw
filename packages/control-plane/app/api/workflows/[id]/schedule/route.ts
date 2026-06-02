/**
 * GET  /api/workflows/[id]/schedule  — get current schedule config
 * POST /api/workflows/[id]/schedule  — set or update cron schedule
 * DELETE /api/workflows/[id]/schedule — disable / clear schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, setWorkflowSchedule } from "@/lib/db";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { nextCronRun } from "@/lib/workflow-scheduler";

type Ctx = { params: Promise<{ id: string }> };

/**
 * @openapi
 * /api/workflows/{id}/schedule:
 *   get:
 *     summary: Retrieve the current schedule configuration for a workflow.
 *     tags: [Workflows]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the workflow.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The current schedule configuration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                 scheduleCron:
 *                   type: string
 *                   nullable: true
 *                 scheduleEnabled:
 *                   type: boolean
 *                 scheduleLastRun:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 scheduleNextRun:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const wf = getWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    workflowId: id,
    scheduleCron: wf.schedule_cron,
    scheduleEnabled: Boolean(wf.schedule_enabled),
    scheduleLastRun: wf.schedule_last_run,
    scheduleNextRun: wf.schedule_next_run,
  });
}

/**
 * @openapi
 * /api/workflows/{id}/schedule:
 *   post:
 *     summary: Set or update the cron schedule for a workflow.
 *     tags: [Workflows]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cron:
 *                 type: string
 *                 description: Cron expression to schedule the workflow.
 *               enabled:
 *                 type: boolean
 *                 description: Whether the schedule is enabled.
 *     responses:
 *       200:
 *         description: Schedule updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 scheduleCron:
 *                   type: string
 *                 scheduleEnabled:
 *                   type: boolean
 *                 scheduleNextRun:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const wf = getWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { cron?: string; enabled?: boolean };
  const cron = body.cron ?? null;
  const enabled = body.enabled !== false; // default true when setting

  if (cron) {
    // Validate cron has 5 fields
    if (cron.trim().split(/\s+/).length !== 5) {
      return NextResponse.json({ error: "Invalid cron expression (expected 5 fields)" }, { status: 400 });
    }
  }

  const nextRun = cron ? nextCronRun(cron)?.toISOString() ?? null : null;
  setWorkflowSchedule(id, cron, enabled, nextRun);

  return NextResponse.json({
    success: true,
    scheduleCron: cron,
    scheduleEnabled: enabled,
    scheduleNextRun: nextRun,
  });
}

/**
 * @openapi
 * /api/workflows/{id}/schedule:
 *   delete:
 *     summary: Disable or clear the workflow schedule.
 *     tags: [Workflows]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the workflow.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Schedule successfully disabled or cleared.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const wf = getWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  setWorkflowSchedule(id, null, false, null);
  return NextResponse.json({ success: true });
}
