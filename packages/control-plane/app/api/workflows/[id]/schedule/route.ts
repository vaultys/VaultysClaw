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

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext();
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

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext();
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

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const wf = getWorkflow(id);
  if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  setWorkflowSchedule(id, null, false, null);
  return NextResponse.json({ success: true });
}
