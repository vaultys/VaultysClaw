/**
 * Live health checks for the Integrations page — surfaces exactly the failure mode that's
 * otherwise invisible until an event silently never arrives: Redis/Apprise can both be reachable
 * and correctly configured while nothing is actually consuming the queue (no
 * `packages/webhook-dispatcher` instance running for this schema — see that package's CLAUDE.md
 * and this one's "Development" section for how to start one). Producer-side reachability alone
 * can't tell you that; only asking Redis "how many workers are attached to this queue right now"
 * can.
 */
import { getQueue, QUEUE_PREFIX } from "./webhook-queue";

export interface ServiceHealth {
  configured: boolean;
  ok: boolean;
  error?: string;
}

export interface DispatcherHealth {
  /** Whether Redis itself is configured — a dispatcher can't possibly be attached if not. */
  checked: boolean;
  ok: boolean;
  workerCount: number;
  error?: string;
}

export interface IntegrationsHealth {
  redis: ServiceHealth;
  apprise: ServiceHealth;
  dispatcher: DispatcherHealth;
}

async function checkRedis(): Promise<ServiceHealth> {
  if (!process.env.REDIS_URL) return { configured: false, ok: false };
  const queue = getQueue();
  if (!queue) return { configured: false, ok: false };
  try {
    // `queue.client` resolves only once BullMQ's own waitUntilReady() succeeds (or rejects if it
    // can't connect), so a resolved status of "ready" here is a genuine, current liveness check,
    // not a stale cached value — no separate ping needed (IRedisClient's minimal adapter surface
    // doesn't expose one anyway).
    const client = await queue.client;
    return { configured: true, ok: client.status === "ready" };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkApprise(): Promise<ServiceHealth> {
  const url = process.env.APPRISE_API_URL;
  if (!url) return { configured: false, ok: false };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { configured: true, ok: res.ok, error: res.ok ? undefined : `responded ${res.status}` };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A "worker" here means any process (this repo's packages/webhook-dispatcher, or otherwise) that
 *  has an active BullMQ Worker attached to this exact queue+prefix — not whether Redis itself is
 *  up, which `checkRedis` already covers. */
async function checkDispatcher(): Promise<DispatcherHealth> {
  if (!process.env.REDIS_URL) return { checked: false, ok: false, workerCount: 0 };
  const queue = getQueue();
  if (!queue) return { checked: false, ok: false, workerCount: 0 };
  try {
    const workers = await queue.getWorkers();
    return { checked: true, ok: workers.length > 0, workerCount: workers.length };
  } catch (err) {
    return { checked: true, ok: false, workerCount: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkIntegrationsHealth(): Promise<IntegrationsHealth> {
  const [redis, apprise, dispatcher] = await Promise.all([checkRedis(), checkApprise(), checkDispatcher()]);
  return { redis, apprise, dispatcher };
}

/** For display only — the prefix a dispatcher instance for this schema must be started with. */
export const DISPATCHER_QUEUE_PREFIX = QUEUE_PREFIX;
