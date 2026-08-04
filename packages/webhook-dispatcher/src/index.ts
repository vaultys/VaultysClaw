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
  processNotificationJob,
  shouldDeadLetter,
  type WebhookSubscription,
  type NotificationChannelSubscription,
} from "./delivery";

const log = pino({ name: "webhook-dispatcher" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Per-endpoint delivery timeout. */
const DELIVERY_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 10_000);

/**
 * Notification Channels (docs/REBUILD_ARCHITECTURE.md §5) — unset by default, so an existing
 * deployment against a schema with no `NotificationChannel` model (e.g. packages/control-plane's,
 * until its own step-4 migration adds one) never touches that table at all: the whole code path
 * below is gated on this being set, not just on the table happening to exist.
 */
const APPRISE_API_URL = process.env.APPRISE_API_URL || undefined;

/**
 * Namespaces every BullMQ key this process touches. Unset by default (current
 * control-plane deployment: unchanged). A second control-plane-family app
 * pointed at the same Redis (e.g. packages/controlplane, a separate Postgres
 * database) needs its own dispatcher instance with this set to a distinct
 * value, so the two apps' queues never collide even on shared infrastructure —
 * see packages/controlplane/CLAUDE.md's Webhooks section.
 */
const BULLMQ_PREFIX = process.env.BULLMQ_PREFIX || undefined;

/**
 * Job data as stored on the queue. `_delivered`/`_notifiedChannels` are bookkeeping the worker
 * adds across retries: the webhook endpoint ids / notification channel ids that already
 * succeeded, so the whole-job retry only re-hits the targets that actually failed. Tracked
 * separately since the two delivery mechanisms have independent id namespaces.
 */
type QueuedWebhookJob = WebhookJob & { _delivered?: string[]; _notifiedChannels?: string[] };

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
const deadQueue = new Queue(WEBHOOK_DLQ_NAME, { connection, prefix: BULLMQ_PREFIX });

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

/** Load active subscriptions from the `NotificationChannel` table — never selects `serviceUrls`,
 *  encrypted or otherwise; this process has no way to decrypt it and doesn't need to. */
async function loadActiveNotificationChannels(): Promise<NotificationChannelSubscription[]> {
  const active = await prisma.notificationChannel.findMany({
    where: { isActive: true },
    select: { id: true, appriseKey: true, events: true },
  });
  return active;
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<QueuedWebhookJob>(
  WEBHOOK_QUEUE_NAME,
  async (job) => {
    const alreadyDelivered = job.data._delivered ?? [];
    const alreadyNotified = job.data._notifiedChannels ?? [];

    const [webhookResult, notificationResult] = await Promise.all([
      processWebhookJob({ fetch, timeoutMs: DELIVERY_TIMEOUT_MS, loadActiveWebhooks }, job.data, alreadyDelivered),
      processNotificationJob(
        { fetch, appriseApiUrl: APPRISE_API_URL, loadActiveNotificationChannels },
        job.data,
        alreadyNotified
      ),
    ]);

    if (webhookResult.skipped && notificationResult.skipped) {
      log.warn({ eventType: job.data.eventType }, "unknown event type — skipped entirely");
      return;
    }

    log.info(
      { eventType: job.data.eventType, webhookTargets: webhookResult.targets, notificationTargets: notificationResult.targets },
      "processing event"
    );

    // Persist what succeeded this run so a retry (triggered below) doesn't re-deliver to targets
    // that already succeeded — tracked separately per delivery mechanism.
    const newDataFields: Partial<QueuedWebhookJob> = {};
    if (webhookResult.delivered.length > 0) {
      newDataFields._delivered = [...alreadyDelivered, ...webhookResult.delivered];
    }
    if (notificationResult.delivered.length > 0) {
      newDataFields._notifiedChannels = [...alreadyNotified, ...notificationResult.delivered];
    }
    if (Object.keys(newDataFields).length > 0) {
      await job.updateData({ ...job.data, ...newDataFields });
    }

    for (const o of webhookResult.outcomes) {
      if (o.ok) {
        log.info({ webhookId: o.endpointId, event: job.data.eventType, status: o.status }, "delivered");
      } else {
        log.warn({ webhookId: o.endpointId, event: job.data.eventType, err: o.error }, "delivery failed");
      }
    }
    for (const o of notificationResult.outcomes) {
      if (o.ok) {
        log.info({ channelId: o.channelId, event: job.data.eventType }, "notified");
      } else {
        log.warn({ channelId: o.channelId, event: job.data.eventType, err: o.error }, "notification failed");
      }
    }

    // Throw so BullMQ retries the whole job; the retry skips targets already marked delivered/notified.
    const totalFailures = webhookResult.failures.length + notificationResult.failures.length;
    if (totalFailures > 0) {
      throw new Error(
        `${webhookResult.failures.length}/${webhookResult.targets} webhook deliveries and ` +
          `${notificationResult.failures.length}/${notificationResult.targets} notifications failed`
      );
    }
  },
  { connection, prefix: BULLMQ_PREFIX }
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
