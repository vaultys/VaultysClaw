import { Queue, Worker, type RedisOptions } from "bullmq";
import pino from "pino";
import {
  WEBHOOK_DLQ_NAME,
  WEBHOOK_QUEUE_NAME,
  type WebhookJob,
} from "@vaultysclaw/shared";
import { prisma } from "./prisma";
import {
  buildDeadLetter,
  processWebhookJob,
  shouldDeadLetter,
  type WebhookSubscription,
} from "./delivery";

const log = pino({ name: "webhook-dispatcher" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Per-endpoint delivery timeout. */
const DELIVERY_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 10_000);

/**
 * Job data as stored on the queue. `_delivered` is bookkeeping the worker adds
 * across retries: the endpoint ids that already succeeded, so the whole-job
 * retry only re-hits the endpoints that actually failed.
 */
type QueuedWebhookJob = WebhookJob & { _delivered?: string[] };

/** Parse REDIS_URL into BullMQ connection options (BullMQ owns its ioredis). */
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

const connection = connectionFromUrl(REDIS_URL);

/** Dead-letter queue: jobs that exhaust their retries land here for inspection. */
const deadQueue = new Queue(WEBHOOK_DLQ_NAME, { connection });

/** Load active subscriptions from the `webhooks` table. */
async function loadActiveWebhooks(): Promise<WebhookSubscription[]> {
  const active = await prisma.webhook.findMany({ where: { isActive: true } });
  return active.map((w) => ({
    id: w.id,
    url: w.url,
    secret: w.secret,
    events: w.events,
  }));
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<QueuedWebhookJob>(
  WEBHOOK_QUEUE_NAME,
  async (job) => {
    const alreadyDelivered = job.data._delivered ?? [];
    const result = await processWebhookJob(
      { fetch, timeoutMs: DELIVERY_TIMEOUT_MS, loadActiveWebhooks },
      job.data,
      alreadyDelivered
    );

    if (result.skipped) {
      log.warn(
        { eventType: job.data.eventType },
        "unknown event type — skipped"
      );
      return;
    }

    log.info(
      { eventType: job.data.eventType, targets: result.targets },
      "processing webhook event"
    );

    // Persist the endpoints delivered this run so a retry (triggered below) does
    // not re-deliver to endpoints that already succeeded.
    if (result.delivered.length > 0) {
      await job.updateData({
        ...job.data,
        _delivered: [...alreadyDelivered, ...result.delivered],
      });
    }

    for (const o of result.outcomes) {
      if (o.ok) {
        log.info(
          { webhookId: o.endpointId, event: job.data.eventType, status: o.status },
          "delivered"
        );
      } else {
        log.warn(
          { webhookId: o.endpointId, event: job.data.eventType, err: o.error },
          "delivery failed"
        );
      }
    }

    // Throw so BullMQ retries the whole job; the retry skips endpoints already
    // marked in `_delivered`.
    if (result.failures.length > 0) {
      throw new Error(
        `${result.failures.length}/${result.targets} webhook deliveries failed`
      );
    }
  },
  { connection }
);

// ── Dead-letter on final failure ────────────────────────────────────────────

worker.on("failed", async (job, err) => {
  log.error({ jobId: job?.id, err: err.message }, "job failed");
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 1;
  if (!shouldDeadLetter(job.attemptsMade, maxAttempts)) return;

  const dead = buildDeadLetter(job.data, {
    attemptsMade: job.attemptsMade,
    error: err.message,
    deliveredEndpointIds: job.data._delivered ?? [],
  });
  try {
    await deadQueue.add(dead.job.eventType, dead, {
      removeOnComplete: false,
      removeOnFail: false,
    });
    log.warn(
      { jobId: job.id, event: dead.job.eventType, attempts: dead.attemptsMade },
      "moved to dead-letter queue"
    );
  } catch (e) {
    log.error(
      { jobId: job.id, err: e instanceof Error ? e.message : String(e) },
      "failed to enqueue dead letter"
    );
  }
});

worker.on("ready", () => log.info("webhook dispatcher worker ready"));

const shutdown = async () => {
  log.info("shutting down webhook dispatcher");
  await worker.close();
  await deadQueue.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log.info({ queue: WEBHOOK_QUEUE_NAME }, "webhook dispatcher started");
