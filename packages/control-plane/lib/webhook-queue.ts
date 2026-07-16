import { Queue, type RedisOptions } from "bullmq";
import { WEBHOOK_QUEUE_NAME, type WebhookJob } from "@vaultysclaw/shared";
import { stripSensitive } from "./webhook-payloads";

/**
 * Producer side of the webhook pipeline. Domain events are enqueued here and
 * consumed by the standalone `@vaultysclaw/webhook-dispatcher` service, which
 * signs and POSTs them to the configured endpoints.
 *
 * Enqueueing is best-effort: if Redis is not configured/reachable it must never
 * break the calling request flow (all call sites use `enqueueWebhook` which
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
      "[webhooks] REDIS_URL not set — webhook events will not be enqueued"
    );
    disabled = true;
    return null;
  }

  queue = new Queue(WEBHOOK_QUEUE_NAME, {
    connection: connectionFromUrl(url),
  });
  return queue;
}

/**
 * Enqueue a webhook event. Fire-and-forget: errors are logged, never thrown, so
 * callers can `void enqueueWebhook(...)` without risk. The payload is passed
 * through `stripSensitive` as a defence-in-depth safeguard on top of the
 * explicit per-event payload builders in `webhook-payloads.ts`.
 */
export async function enqueueWebhook(input: {
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const q = getQueue();
    if (!q) return;
    const job: WebhookJob = {
      eventType: input.eventType,
      payload: stripSensitive(input.payload) as Record<string, unknown>,
      occurredAt: new Date().toISOString(),
    };
    await q.add(job.eventType, job, {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
    });
  } catch (err) {
    console.error(
      "[webhooks] failed to enqueue event",
      input.eventType,
      err instanceof Error ? err.message : err
    );
  }
}
