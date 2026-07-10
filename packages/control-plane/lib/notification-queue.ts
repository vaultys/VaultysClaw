import { Queue, type RedisOptions } from "bullmq";
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJob,
} from "@vaultysclaw/shared";

/**
 * Producer side of the notification pipeline. Domain events are enqueued here
 * and consumed by the standalone `@vaultysclaw/notifier` service.
 *
 * Enqueueing is best-effort: if Redis is not configured/reachable it must never
 * break the calling request flow (all call sites use `enqueueNotification` which
 * swallows and logs errors).
 */

let queue: Queue | null = null;
let disabled = false;

/** Parse REDIS_URL into BullMQ connection options (using BullMQ's own ioredis). */
function connectionFromUrl(url: string): RedisOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    maxRetriesPerRequest: null,
  };
}

function getQueue(): Queue | null {
  if (disabled) return null;
  if (queue) return queue;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn(
      "[notifications] REDIS_URL not set — notification events will not be enqueued"
    );
    disabled = true;
    return null;
  }

  queue = new Queue(NOTIFICATION_QUEUE_NAME, {
    connection: connectionFromUrl(url),
  });
  return queue;
}

/**
 * Enqueue a notification event. Fire-and-forget: errors are logged, never
 * thrown, so callers can `void enqueueNotification(...)` without risk.
 */
export async function enqueueNotification(job: NotificationJob): Promise<void> {
  try {
    const q = getQueue();
    if (!q) return;
    await q.add(job.eventType, job, {
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  } catch (err) {
    console.error(
      "[notifications] failed to enqueue event",
      job.eventType,
      err instanceof Error ? err.message : err
    );
  }
}
