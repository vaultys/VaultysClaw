import crypto from "node:crypto";
import { Worker, type RedisOptions } from "bullmq";
import pino from "pino";
import {
  WEBHOOK_QUEUE_NAME,
  getWebhookEvent,
  type WebhookJob,
} from "@vaultysclaw/shared";
import { prisma } from "./prisma";
import { sign } from "./sign";

const log = pino({ name: "webhook-dispatcher" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Per-endpoint delivery timeout. */
const DELIVERY_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 10_000);

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

// ── Delivery ────────────────────────────────────────────────────────────────

/**
 * Deliver a single event to a single endpoint. Throws on non-2xx / network
 * error so BullMQ's retry policy (configured on the producer job) can re-run the
 * whole job. Best-effort: no delivery is persisted.
 */
async function deliverTo(
  endpoint: { id: string; url: string; secret: string },
  job: WebhookJob
): Promise<void> {
  const rawBody = JSON.stringify({
    event: job.eventType,
    occurredAt: job.occurredAt,
    data: job.payload,
  });
  const timestamp = String(Date.now());
  const deliveryId = crypto.randomUUID();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "VaultysClaw-Webhooks/1.0",
        "X-VaultysClaw-Event": job.eventType,
        "X-VaultysClaw-Delivery": deliveryId,
        "X-VaultysClaw-Timestamp": timestamp,
        "X-VaultysClaw-Signature": sign(endpoint.secret, timestamp, rawBody),
      },
      body: rawBody,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`endpoint responded ${res.status}`);
    }
    log.info(
      { webhookId: endpoint.id, event: job.eventType, status: res.status },
      "delivered"
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<WebhookJob>(
  WEBHOOK_QUEUE_NAME,
  async (job) => {
    const payload = job.data;
    if (!getWebhookEvent(payload.eventType)) {
      log.warn({ eventType: payload.eventType }, "unknown event type — skipped");
      return;
    }

    const active = await prisma.webhook.findMany({ where: { isActive: true } });
    const targets = active.filter((w) =>
      ((w.events as string[]) ?? []).includes(payload.eventType)
    );

    log.info(
      { eventType: payload.eventType, targets: targets.length },
      "processing webhook event"
    );

    // Deliver to all matching endpoints. If any fails, throw so BullMQ retries
    // the whole job (idempotent enough for at-least-once delivery semantics).
    const results = await Promise.allSettled(
      targets.map((w) =>
        deliverTo({ id: w.id, url: w.url, secret: w.secret }, payload)
      )
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed)
        if (f.status === "rejected")
          log.warn(
            { event: payload.eventType, err: String(f.reason) },
            "delivery failed"
          );
      throw new Error(
        `${failed.length}/${targets.length} webhook deliveries failed`
      );
    }
  },
  { connection: connectionFromUrl(REDIS_URL) }
);

worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, err: err.message }, "job failed")
);
worker.on("ready", () => log.info("webhook dispatcher worker ready"));

const shutdown = async () => {
  log.info("shutting down webhook dispatcher");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log.info({ queue: WEBHOOK_QUEUE_NAME }, "webhook dispatcher started");
