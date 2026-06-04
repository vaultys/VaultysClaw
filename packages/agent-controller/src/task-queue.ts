/**
 * Task queue — persistent SQLite-backed queue for agent task execution.
 *
 * Tasks are persisted across restarts. The worker loop polls the DB,
 * picks up the highest-priority pending task, executes it, and handles
 * retries with exponential backoff.
 *
 * Status transitions:
 *   pending → running → success
 *                     → failed (retries remain) → pending (re-queued with backoff)
 *                     → dead   (max retries exhausted)
 */

import { randomUUID } from "crypto";
import pino from "pino";
import {
  insertTask,
  getNextPendingTask,
  setTaskRunning,
  setTaskCompleted,
  setTaskFailed,
  requeueFailedTask,
  getRecentTasks,
  type TaskRow,
  type TaskStatus,
} from "./db";

export type { TaskRow, TaskStatus };

const logger = pino({ name: "task-queue" });

// ---------------------------------------------------------------------------
// Task executor callback
// ---------------------------------------------------------------------------

export type TaskExecutor = (
  action: string,
  params: Record<string, unknown>
) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Task queue
// ---------------------------------------------------------------------------

export interface EnqueueOptions {
  /** Higher numbers = higher priority. Default 0. */
  priority?: number;
  /** ISO 8601 timestamp — don't run before this time. */
  scheduledAt?: string;
  /** Max retry attempts before marking as dead. Default 3. */
  maxRetries?: number;
  /** Who triggered this task (user DID, schedule ID, etc.). */
  createdBy?: string;
}

export interface TaskQueueOptions {
  /** How often to poll the DB for pending tasks (ms). Default 2000. */
  pollIntervalMs?: number;
  /** Max concurrent tasks running simultaneously. Default 1. */
  concurrency?: number;
  /** Base delay for exponential backoff on retries (ms). Default 5000. */
  retryBaseDelayMs?: number;
  /** Called when a task finishes (success, failed, or dead). */
  onTaskUpdate?: (task: {
    id: string;
    action: string;
    status: TaskStatus;
    result?: unknown;
    error?: string;
  }) => void;
}

export class TaskQueue {
  private executor: TaskExecutor;
  private opts: Required<Omit<TaskQueueOptions, "onTaskUpdate">>;
  private onTaskUpdate?: TaskQueueOptions["onTaskUpdate"];
  private running = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;

  constructor(executor: TaskExecutor, opts: TaskQueueOptions = {}) {
    this.executor = executor;
    this.onTaskUpdate = opts.onTaskUpdate;
    this.opts = {
      pollIntervalMs: opts.pollIntervalMs ?? 2_000,
      concurrency: opts.concurrency ?? 1,
      retryBaseDelayMs: opts.retryBaseDelayMs ?? 5_000,
    };
  }

  // ---- Public API ----

  /** Enqueue a new task and return its ID. */
  enqueue(
    action: string,
    params: Record<string, unknown> = {},
    opts: EnqueueOptions = {}
  ): string {
    const id = randomUUID();
    insertTask({
      id,
      action,
      params: JSON.stringify(params),
      status: "pending",
      priority: opts.priority ?? 0,
      scheduled_at: opts.scheduledAt ?? null,
      started_at: null,
      completed_at: null,
      result: null,
      error: null,
      retry_count: 0,
      max_retries: opts.maxRetries ?? 3,
      created_by: opts.createdBy ?? null,
    });
    logger.info({ id, action, priority: opts.priority ?? 0 }, "Task enqueued");
    return id;
  }

  /** Get recent tasks for UI display. */
  getRecent(limit = 50): TaskRow[] {
    return getRecentTasks(limit);
  }

  /** Start the polling worker loop. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.pollTimer = setInterval(() => this.poll(), this.opts.pollIntervalMs);
    logger.info(
      { pollIntervalMs: this.opts.pollIntervalMs },
      "Task queue worker started"
    );
    // Run immediately on start
    this.poll();
  }

  /** Stop the worker loop. In-flight tasks complete naturally. */
  stop(): void {
    this.active = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ---- Internal worker ----

  private poll(): void {
    if (!this.active) return;
    while (this.running < this.opts.concurrency) {
      const task = getNextPendingTask();
      if (!task) break;
      this.running++;
      this.runTask(task).finally(() => {
        this.running--;
      });
    }
  }

  private async runTask(task: TaskRow): Promise<void> {
    setTaskRunning(task.id);
    logger.info(
      { id: task.id, action: task.action, attempt: task.retry_count + 1 },
      "Running task"
    );

    try {
      const params = JSON.parse(task.params) as Record<string, unknown>;
      const result = await this.executor(task.action, params);
      setTaskCompleted(task.id, result);
      logger.info({ id: task.id, action: task.action }, "Task completed");
      this.onTaskUpdate?.({
        id: task.id,
        action: task.action,
        status: "success",
        result,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setTaskFailed(task.id, errMsg);

      // Re-fetch to check new status (dead vs failed)
      const updated = getNextPendingTask();
      const isFailed = !updated && task.retry_count + 1 < task.max_retries;
      if (task.retry_count + 1 < task.max_retries) {
        // Exponential backoff: base * 2^attempt (capped at 10 min)
        const delay = Math.min(
          this.opts.retryBaseDelayMs * Math.pow(2, task.retry_count),
          600_000
        );
        requeueFailedTask(task.id, delay);
        logger.warn(
          {
            id: task.id,
            action: task.action,
            attempt: task.retry_count + 1,
            retryIn: delay,
          },
          "Task failed — will retry"
        );
        this.onTaskUpdate?.({
          id: task.id,
          action: task.action,
          status: "failed",
          error: errMsg,
        });
      } else {
        logger.error(
          { id: task.id, action: task.action, error: errMsg },
          "Task dead — max retries exhausted"
        );
        this.onTaskUpdate?.({
          id: task.id,
          action: task.action,
          status: "dead",
          error: errMsg,
        });
      }
    }
  }
}
