import { Worker, type RedisOptions } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import {
  NOTIFICATION_QUEUE_NAME,
  getNotificationEvent,
  userNotificationChannel,
  type NotificationChannel,
  type NotificationJob,
  type NotificationStreamMessage,
} from "@vaultysclaw/shared";
import { prisma } from "./prisma";
import { sendMail } from "./smtp";
import { renderNotification } from "./render";

const log = pino({ name: "notifier" });

// ── Redis wiring ──────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

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

// Dedicated publisher for the per-user SSE pub/sub fan-out.
const publisher = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
publisher.on("error", (err) => log.error({ err: err.message }, "redis publisher error"));

// ── Role helpers (mirror control-plane/lib/roles.ts, kept minimal) ────────────

function normalizeRole(value: string | null | undefined): "Owner" | "Admin" | "Member" {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "owner") return "Owner";
  if (v === "admin") return "Admin";
  return "Member";
}
const isAdmin = (r: string | null | undefined) => {
  const n = normalizeRole(r);
  return n === "Owner" || n === "Admin";
};
const isOwner = (r: string | null | undefined) => normalizeRole(r) === "Owner";

// ── Recipient resolution ──────────────────────────────────────────────────────

interface Recipient {
  id: string;
  email: string | null;
}

async function resolveRecipients(job: NotificationJob): Promise<Recipient[]> {
  const def = getNotificationEvent(job.eventType);
  if (!def) return [];

  if (def.level === "user") {
    const targetId = (job.data.targetUserId ?? job.data.userId) as
      | string
      | undefined;
    if (!targetId) return [];
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true },
    });
    return user ? [user] : [];
  }

  // admin / owner levels → all users whose role clears the bar.
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true },
  });
  const pass = def.level === "owner" ? isOwner : isAdmin;
  return users.filter((u) => pass(u.role)).map((u) => ({ id: u.id, email: u.email }));
}

// ── Preference resolution ─────────────────────────────────────────────────────

interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

async function resolvePrefs(
  userId: string,
  eventType: string,
  defaults: NotificationChannel[]
): Promise<ChannelPrefs> {
  const explicit = await prisma.notificationPreference.findUnique({
    where: { userId_eventType: { userId, eventType } },
  });
  if (explicit) {
    return { inApp: explicit.inApp, email: explicit.email, push: explicit.push };
  }
  return {
    inApp: defaults.includes("inApp"),
    email: defaults.includes("email"),
    push: defaults.includes("push"),
  };
}

// ── Delivery ──────────────────────────────────────────────────────────────────

async function deliver(recipient: Recipient, job: NotificationJob) {
  const def = getNotificationEvent(job.eventType);
  if (!def) return;

  const prefs = await resolvePrefs(recipient.id, job.eventType, def.defaultChannels);
  if (!prefs.inApp && !prefs.email && !prefs.push) return;

  const { title, body } = renderNotification(job.eventType, job.data);

  // In-app: persist a Notification row (this is what the bell reads on load).
  let notificationId: string | undefined;
  if (prefs.inApp) {
    const created = await prisma.notification.create({
      data: {
        userId: recipient.id,
        eventType: job.eventType,
        title,
        body,
        data: job.data as any,
      },
    });
    notificationId = created.id;
  }

  // Real-time: push to the user's SSE channel for the bell (in-app) and/or a
  // system notification (push).
  if (prefs.inApp || prefs.push) {
    const message: NotificationStreamMessage = {
      id: notificationId,
      eventType: job.eventType,
      title,
      body,
      data: job.data,
      createdAt: new Date().toISOString(),
      push: prefs.push,
    };
    await publisher.publish(
      userNotificationChannel(recipient.id),
      JSON.stringify(message)
    );
  }

  // Email.
  if (prefs.email && recipient.email) {
    try {
      const sent = await sendMail({
        to: recipient.email,
        subject: title,
        html: `<p>${body}</p>`,
        text: body,
      });
      if (!sent) log.warn("SMTP not configured — email skipped");
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : err },
        "failed to send email"
      );
    }
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<NotificationJob>(
  NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const payload = job.data;
    const def = getNotificationEvent(payload.eventType);
    if (!def) {
      log.warn({ eventType: payload.eventType }, "unknown event type — skipped");
      return;
    }
    const recipients = await resolveRecipients(payload);
    log.info(
      { eventType: payload.eventType, recipients: recipients.length },
      "processing notification"
    );
    for (const r of recipients) {
      await deliver(r, payload);
    }
  },
  { connection: connectionFromUrl(REDIS_URL) }
);

worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, err: err.message }, "job failed")
);
worker.on("ready", () => log.info("notifier worker ready"));

const shutdown = async () => {
  log.info("shutting down notifier");
  await worker.close();
  await publisher.quit();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log.info({ queue: NOTIFICATION_QUEUE_NAME }, "notifier started");
