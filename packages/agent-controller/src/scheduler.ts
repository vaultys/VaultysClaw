/**
 * Cron-based scheduler for the agent task queue.
 *
 * Supports standard 5-field cron expressions:
 *   minute hour day-of-month month day-of-week
 *
 * Each field accepts:
 *   - asterisk (any)
 *   - number (exact match)
 *   - number/n (step)
 *   - a,b,c (list)
 *   - a-b (range)
 *
 * The scheduler polls every minute for due schedules and enqueues tasks.
 */

import pino from "pino";
import {
  getActiveSchedules,
  updateScheduleLastRun,
  upsertSchedule,
  deleteSchedule,
  type ScheduleRow,
} from "./db";
import type { TaskQueue } from "./task-queue";

const logger = pino({ name: "scheduler" });

// ---------------------------------------------------------------------------
// Cron parser
// ---------------------------------------------------------------------------

interface CronFields {
  minute: number[];    // 0-59
  hour: number[];      // 0-23
  dayOfMonth: number[]; // 1-31
  month: number[];     // 1-12
  dayOfWeek: number[]; // 0-6 (Sun=0)
}

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
      const [rangeOrStar, step] = part.split("/");
      const stepN = parseInt(step, 10);
      const base = rangeOrStar === "*" ? range(lo, hi) : (() => {
        const [a, b] = rangeOrStar.split("-");
        return range(parseInt(a, 10), parseInt(b, 10));
      })();
      for (let i = 0; i < base.length; i++) {
        if (i % stepN === 0) all.push(base[i]);
      }
    } else if (part.includes("-")) {
      const [a, b] = part.split("-");
      all.push(...range(parseInt(a, 10), parseInt(b, 10)));
    } else {
      all.push(parseInt(part, 10));
    }
  }

  return [...new Set(all)].sort((a, b) => a - b);
}

/**
 * Parse a 5-field cron expression into allowed value sets.
 * Throws on invalid input.
 */
export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression (expected 5 fields): "${expr}"`);
  }
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
}

/**
 * Compute the next ISO timestamp (UTC) at which the cron expression fires,
 * strictly after `from` (defaults to now).
 *
 * Returns null if no match is found within 4 years (safety cap).
 */
export function nextCronRun(expr: string, from?: Date): Date | null {
  const fields = parseCron(expr);
  // Start from the next minute
  const start = new Date(from ?? Date.now());
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  // Cap search at 4 years
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
// Scheduler
// ---------------------------------------------------------------------------

export interface SchedulerOptions {
  /** How often to poll the schedules table (ms). Default 60_000. */
  pollIntervalMs?: number;
}

export interface ScheduleInput {
  id: string;
  name: string;
  cron: string;
  action: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
}

export class Scheduler {
  private taskQueue: TaskQueue | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: Required<SchedulerOptions>;

  constructor(opts: SchedulerOptions = {}) {
    this.opts = { pollIntervalMs: opts.pollIntervalMs ?? 60_000 };
  }

  /** Start scheduler. Will poll schedules and enqueue tasks. */
  start(taskQueue: TaskQueue): void {
    this.taskQueue = taskQueue;
    // Poll immediately, then on interval
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.pollIntervalMs);
    logger.info({ pollIntervalMs: this.opts.pollIntervalMs }, "Scheduler started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.taskQueue = null;
  }

  /** Create or replace a schedule. */
  addSchedule(s: ScheduleInput): void {
    const nextRun = nextCronRun(s.cron);
    upsertSchedule({
      id: s.id,
      name: s.name,
      cron: s.cron,
      action: s.action,
      params: JSON.stringify(s.params ?? {}),
      enabled: s.enabled === false ? 0 : 1,
      last_run: null,
      next_run: nextRun?.toISOString().replace("T", " ").slice(0, 19) ?? null,
    });
    logger.info({ id: s.id, cron: s.cron, nextRun }, "Schedule upserted");
  }

  /** Remove a schedule by ID. */
  removeSchedule(id: string): void {
    deleteSchedule(id);
  }

  // ---- Internal ----

  private tick(): void {
    if (!this.taskQueue) return;

    const schedules = getActiveSchedules();
    const now = new Date();

    for (const s of schedules) {
      if (!s.next_run) continue;
      const nextRun = new Date(s.next_run.replace(" ", "T") + "Z");
      if (nextRun <= now) {
        this.fireSchedule(s, now);
      }
    }
  }

  private fireSchedule(s: ScheduleRow, now: Date): void {
    if (!this.taskQueue) return;

    try {
      const params = JSON.parse(s.params) as Record<string, unknown>;
      const taskId = this.taskQueue.enqueue(s.action, params, {
        createdBy: `schedule:${s.id}`,
        priority: 0,
      });
      logger.info({ scheduleId: s.id, taskId, action: s.action }, "Scheduled task enqueued");
    } catch (err) {
      logger.error({ scheduleId: s.id, err }, "Failed to enqueue scheduled task");
    }

    // Compute next run and update DB
    const next = nextCronRun(s.cron, now);
    const nextStr = next?.toISOString().replace("T", " ").slice(0, 19) ?? null;
    updateScheduleLastRun(s.id, nextStr);
  }
}
