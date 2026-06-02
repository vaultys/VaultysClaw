/**
 * Workflow scheduler — runs inside the control plane.
 *
 * Polls every 60 s for workflows whose schedule_next_run has passed,
 * fires them via executeWorkflow(), then advances schedule_next_run.
 *
 * Cron parsing is copied from agent-controller/src/scheduler.ts so
 * the control plane has no runtime dependency on that package.
 */

import pino from "pino";
import {
  getDueScheduledWorkflows,
  updateWorkflowScheduleRun,
  startWorkflowRun,
} from "./db";
import { executeWorkflow } from "./workflow-executor";

const logger = pino({ name: "workflow-scheduler" });

// ---------------------------------------------------------------------------
// Tiny cron parser (5-field)
// ---------------------------------------------------------------------------

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function parseField(field: string, lo: number, hi: number): number[] {
  if (field === "*") return range(lo, hi);
  const all: number[] = [];
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [rng, step] = part.split("/");
      const stepN = parseInt(step, 10);
      const base =
        rng === "*"
          ? range(lo, hi)
          : (() => {
              const [a, b] = rng.split("-");
              return range(parseInt(a, 10), parseInt(b, 10));
            })();
      base.forEach((v, i) => {
        if (i % stepN === 0) all.push(v);
      });
    } else if (part.includes("-")) {
      const [a, b] = part.split("-");
      all.push(...range(parseInt(a, 10), parseInt(b, 10)));
    } else {
      all.push(parseInt(part, 10));
    }
  }
  return [...new Set(all)].sort((a, b) => a - b);
}

export function nextCronRun(expr: string, from?: Date): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields = {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
  const start = new Date(from ?? Date.now());
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);
  const deadline = new Date(start);
  deadline.setUTCFullYear(deadline.getUTCFullYear() + 4);
  const d = new Date(start);
  while (d < deadline) {
    if (
      fields.month.includes(d.getUTCMonth() + 1) &&
      fields.dayOfMonth.includes(d.getUTCDate()) &&
      fields.dayOfWeek.includes(d.getUTCDay()) &&
      fields.hour.includes(d.getUTCHours()) &&
      fields.minute.includes(d.getUTCMinutes())
    ) {
      return new Date(d);
    }
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scheduler class
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  const due = getDueScheduledWorkflows();
  if (due.length === 0) return;

  logger.info({ count: due.length }, "Firing scheduled workflows");

  for (const wf of due) {
    try {
      const definition = JSON.parse(wf.definition);
      const runId = startWorkflowRun(wf.id);

      // Fire and forget — the executor updates run status itself
      executeWorkflow(
        runId,
        definition,
        undefined,
        wf.id,
        wf.realm_id ?? undefined
      ).catch((err) =>
        logger.error(
          { workflowId: wf.id, runId, err },
          "Scheduled workflow execution failed"
        )
      );

      // Advance to next scheduled run
      const next = wf.schedule_cron ? nextCronRun(wf.schedule_cron) : null;
      updateWorkflowScheduleRun(wf.id, next?.toISOString() ?? null);

      logger.info(
        { workflowId: wf.id, runId, nextRun: next?.toISOString() },
        "Scheduled workflow started"
      );
    } catch (err) {
      logger.error(
        { workflowId: wf.id, err },
        "Failed to start scheduled workflow"
      );
    }
  }
}

export function startWorkflowScheduler(pollIntervalMs = 60_000) {
  if (timer) return; // already running
  logger.info({ pollIntervalMs }, "Workflow scheduler started");
  tick(); // run immediately on startup
  timer = setInterval(() => {
    tick().catch((e) => logger.error(e));
  }, pollIntervalMs);
}

export function stopWorkflowScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
