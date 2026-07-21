import crypto from "node:crypto";
import {
  getWebhookEvent,
  type DeadWebhookJob,
  type WebhookJob,
} from "@vaultysclaw/shared";
import { sign } from "./sign";

/**
 * Pure / injectable delivery logic for the webhook dispatcher. Everything here
 * is free of BullMQ, Prisma and ambient I/O — network access and the
 * subscription lookup are passed in as dependencies — so the fan-out, signing,
 * retry and dead-letter behaviour can be unit-tested without Redis or a DB.
 * `src/index.ts` wires these functions to the real Worker / Queue / Prisma /
 * fetch.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single active webhook subscription (a row of the `webhooks` table). */
export interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  /** Prisma `Json` column — expected to be a `string[]` of subscribed events. */
  events: unknown;
}

/** A fully-built, signed HTTP request ready to POST to an endpoint. */
export interface DeliveryRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  deliveryId: string;
}

/** The result of attempting delivery to one endpoint. Never a thrown error. */
export interface DeliveryOutcome {
  endpointId: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/** Dependencies for delivering to a single endpoint. */
export interface DeliveryDeps {
  fetch: typeof fetch;
  timeoutMs: number;
}

/** Dependencies for processing a whole job (fan-out over subscriptions). */
export interface ProcessDeps extends DeliveryDeps {
  loadActiveWebhooks: () => Promise<WebhookSubscription[]>;
}

/** The outcome of processing one webhook job across all its target endpoints. */
export interface ProcessResult {
  /** Set when the job was skipped without any delivery attempt. */
  skipped?: "unknown-event";
  /** Number of endpoints delivery was attempted against this run. */
  targets: number;
  outcomes: DeliveryOutcome[];
  /** Endpoint ids that succeeded this run. */
  delivered: string[];
  /** Endpoints that failed this run (drives the retry / dead-letter decision). */
  failures: DeliveryOutcome[];
}

// ── Request construction ────────────────────────────────────────────────────

/**
 * Build the signed HTTP request for delivering `job` to `endpoint`. Pure: the
 * clock and delivery id can be injected for deterministic tests. The signature
 * covers `${timestamp}.${rawBody}` (see {@link sign}).
 */
export function buildDeliveryRequest(
  endpoint: Pick<WebhookSubscription, "url" | "secret">,
  job: WebhookJob,
  now: number = Date.now(),
  deliveryId: string = crypto.randomUUID()
): DeliveryRequest {
  const rawBody = JSON.stringify({
    event: job.eventType,
    occurredAt: job.occurredAt,
    data: job.payload,
  });
  const timestamp = String(now);
  return {
    url: endpoint.url,
    deliveryId,
    body: rawBody,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "VaultysClaw-Webhooks/1.0",
      "X-VaultysClaw-Event": job.eventType,
      "X-VaultysClaw-Delivery": deliveryId,
      "X-VaultysClaw-Timestamp": timestamp,
      "X-VaultysClaw-Signature": sign(endpoint.secret, timestamp, rawBody),
    },
  };
}

/** The subscriptions subscribed to `eventType`. Tolerant of a non-array column. */
export function selectTargets(
  webhooks: WebhookSubscription[],
  eventType: string
): WebhookSubscription[] {
  return webhooks.filter((w) =>
    (Array.isArray(w.events) ? (w.events as string[]) : []).includes(eventType)
  );
}

// ── Delivery ─────────────────────────────────────────────────────────────────

/**
 * Deliver a job to one endpoint. Never throws — any non-2xx, network error or
 * timeout is captured in the returned {@link DeliveryOutcome} so the caller can
 * decide retry / dead-letter for the whole job.
 */
export async function deliverOne(
  deps: DeliveryDeps,
  endpoint: WebhookSubscription,
  job: WebhookJob
): Promise<DeliveryOutcome> {
  const req = buildDeliveryRequest(endpoint, job);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        endpointId: endpoint.id,
        ok: false,
        status: res.status,
        error: `endpoint responded ${res.status}`,
      };
    }
    return { endpointId: endpoint.id, ok: true, status: res.status };
  } catch (err) {
    return {
      endpointId: endpoint.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Process a webhook job: skip unknown events, load active subscriptions, and
 * deliver to every one subscribed to the event that has NOT already succeeded on
 * a previous attempt (`alreadyDelivered`). Skipping already-delivered endpoints
 * is what makes BullMQ's whole-job retry safe: a job that partially failed is
 * retried only against the endpoints that actually failed, so healthy endpoints
 * are never re-delivered.
 */
export async function processWebhookJob(
  deps: ProcessDeps,
  job: WebhookJob,
  alreadyDelivered: string[] = []
): Promise<ProcessResult> {
  if (!getWebhookEvent(job.eventType)) {
    return { skipped: "unknown-event", targets: 0, outcomes: [], delivered: [], failures: [] };
  }

  const active = await deps.loadActiveWebhooks();
  const targets = selectTargets(active, job.eventType).filter(
    (w) => !alreadyDelivered.includes(w.id)
  );

  const outcomes = await Promise.all(
    targets.map((w) => deliverOne(deps, w, job))
  );

  return {
    targets: targets.length,
    outcomes,
    delivered: outcomes.filter((o) => o.ok).map((o) => o.endpointId),
    failures: outcomes.filter((o) => !o.ok),
  };
}

// ── Dead-letter ────────────────────────────────────────────────────────────────

/**
 * Whether a job that just failed has exhausted its retry budget and should be
 * moved to the dead-letter queue. BullMQ increments `attemptsMade` on every
 * attempt, so on the final failure it equals the configured `attempts`.
 */
export function shouldDeadLetter(attemptsMade: number, maxAttempts: number): boolean {
  return attemptsMade >= maxAttempts;
}

/** Wrap a permanently-failed job for the dead-letter queue. */
export function buildDeadLetter(
  job: WebhookJob,
  opts: {
    attemptsMade: number;
    error: string;
    deliveredEndpointIds?: string[];
    failedAt?: string;
  }
): DeadWebhookJob {
  return {
    job: {
      eventType: job.eventType,
      payload: job.payload,
      occurredAt: job.occurredAt,
    },
    failedAt: opts.failedAt ?? new Date().toISOString(),
    attemptsMade: opts.attemptsMade,
    error: opts.error,
    deliveredEndpointIds: opts.deliveredEndpointIds ?? [],
  };
}
