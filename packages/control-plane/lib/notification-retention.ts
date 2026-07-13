/**
 * Notification retention — periodically prunes already-read notifications older
 * than `NOTIFICATION_RETENTION_DAYS` (default 30) so the `notifications` table
 * doesn't grow unbounded. Runs inside the control plane alongside the workflow
 * scheduler. Unread notifications are never deleted.
 */

import pino from "pino";
import { NotificationDAO } from "../db";

const logger = pino({ name: "notification-retention" });

const RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS) || 30;
const SWEEP_INTERVAL_MS = 24 * 60 * 60_000; // daily

let timer: ReturnType<typeof setInterval> | null = null;

async function sweep(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    const { count } = await NotificationDAO.purgeReadOlderThan(cutoff);
    if (count > 0) {
      logger.info({ count, retentionDays: RETENTION_DAYS }, "Purged old notifications");
    }
  } catch (err) {
    logger.warn({ err }, "Notification retention sweep failed");
  }
}

export function startNotificationRetention(): void {
  if (timer) return;
  // Run once shortly after boot, then daily.
  setTimeout(sweep, 30_000);
  timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  logger.info({ retentionDays: RETENTION_DAYS }, "Notification retention started");
}

export function stopNotificationRetention(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
