import {
  getNotificationEvent,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationJob,
} from "@vaultysclaw/shared";

/**
 * Recipient and preference resolution for the notifier. Kept free of a concrete
 * Prisma import (it takes a minimal {@link NotifierDb} surface) so the level →
 * audience routing and preference-fallback logic can be unit-tested with a stub.
 */

export interface Recipient {
  id: string;
  email: string | null;
}

export interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

/** The minimal database surface the notifier needs — satisfied by PrismaClient. */
export interface NotifierDb {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; email: true };
    }): Promise<{ id: string; email: string | null } | null>;
    findMany(args: {
      select: { id: true; email: true; role: true };
    }): Promise<{ id: string; email: string | null; role: string | null }[]>;
  };
  userWorkspace: {
    findMany(args: {
      where: { workspaceId: string };
      select: { userId: true };
    }): Promise<{ userId: string }[]>;
  };
  notificationPreference: {
    findUnique(args: {
      where: { userId_eventType: { userId: string; eventType: string } };
    }): Promise<{ inApp: boolean; email: boolean; push: boolean } | null>;
  };
}

// ── Role helpers (mirror control-plane/lib/roles.ts, kept minimal) ────────────

export function normalizeRole(
  value: string | null | undefined
): "Owner" | "Admin" | "Member" {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "owner") return "Owner";
  if (v === "admin") return "Admin";
  return "Member";
}

export const isAdmin = (r: string | null | undefined): boolean => {
  const n = normalizeRole(r);
  return n === "Owner" || n === "Admin";
};

export const isOwner = (r: string | null | undefined): boolean =>
  normalizeRole(r) === "Owner";

/**
 * Resolve who should receive an event, based on its catalog {@link
 * NotificationAudience}:
 *   - `target`           → the single user named in the payload
 *   - `workspaceMembers` → every member of `data.workspaceId`
 *   - `admins`           → every Admin/Owner
 *   - `owners`           → every Owner
 */
export async function resolveRecipients(
  db: NotifierDb,
  job: NotificationJob
): Promise<Recipient[]> {
  const def = getNotificationEvent(job.eventType);
  if (!def) return [];

  const audience: NotificationAudience = def.audience;

  // Never notify the actor about their own action, for every audience — a change
  // that originates from a user should not notify that same user (this also makes
  // self-only events like a profile self-edit notify nobody).
  const actorId = (job.data.actorDid as string | undefined) ?? undefined;
  const notActor = (id: string) => id !== actorId;

  if (audience === "target") {
    const targetId = (job.data.targetUserId ?? job.data.userId) as
      | string
      | undefined;
    if (!targetId || !notActor(targetId)) return [];
    const user = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true },
    });
    return user ? [{ id: user.id, email: user.email }] : [];
  }

  if (audience === "workspaceMembers") {
    const workspaceId = job.data.workspaceId as string | undefined;
    if (!workspaceId) return [];
    const memberships = await db.userWorkspace.findMany({
      where: { workspaceId },
      select: { userId: true },
    });
    const memberIds = new Set(memberships.map((m) => m.userId));
    if (memberIds.size === 0) return [];
    const users = await db.user.findMany({
      select: { id: true, email: true, role: true },
    });
    return users
      .filter((u) => memberIds.has(u.id) && notActor(u.id))
      .map((u) => ({ id: u.id, email: u.email }));
  }

  // admins / owners
  const users = await db.user.findMany({
    select: { id: true, email: true, role: true },
  });
  const pass = audience === "owners" ? isOwner : isAdmin;
  return users
    .filter((u) => pass(u.role) && notActor(u.id))
    .map((u) => ({ id: u.id, email: u.email }));
}

/**
 * Effective channel preferences for a user + event: the explicit stored row, or
 * the event's catalog defaults when the user has never configured it.
 */
export async function resolvePrefs(
  db: NotifierDb,
  userId: string,
  eventType: string,
  defaults: NotificationChannel[]
): Promise<ChannelPrefs> {
  const explicit = await db.notificationPreference.findUnique({
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
