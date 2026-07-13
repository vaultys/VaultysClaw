import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

export interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

export class NotificationPreferenceDAO {
  /** All explicit preferences for a user, keyed by eventType. */
  static async getForUser(userId: string) {
    return prisma.notificationPreference.findMany({ where: { userId } });
  }

  static async upsert(userId: string, eventType: string, prefs: ChannelPrefs) {
    return prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId, eventType } },
      create: { userId, eventType, ...prefs },
      update: { ...prefs },
    });
  }

  /** Explicit preferences for a set of users for a single event. */
  static async getRecipientsPrefs(userIds: string[], eventType: string) {
    return prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, eventType },
    });
  }
}

export class NotificationDAO {
  static async create(input: {
    userId: string;
    eventType: string;
    title: string;
    body: string;
    data?: Prisma.InputJsonValue;
  }) {
    return prisma.notification.create({
      data: {
        userId: input.userId,
        eventType: input.eventType,
        title: input.title,
        body: input.body,
        data: input.data,
      },
    });
  }

  static async listForUser(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
  ) {
    return prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 10,
      skip: opts.offset ?? 0,
    });
  }

  /** Total notifications for a user (for pagination). */
  static async countForUser(
    userId: string,
    opts: { unreadOnly?: boolean } = {}
  ): Promise<number> {
    return prisma.notification.count({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    });
  }

  static async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Retention: delete already-read notifications older than the cutoff. */
  static async purgeReadOlderThan(cutoff: Date) {
    return prisma.notification.deleteMany({
      where: { readAt: { not: null, lt: cutoff } },
    });
  }

  static async markRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  static async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  static async delete(id: string, userId: string) {
    return prisma.notification.deleteMany({ where: { id, userId } });
  }

  static async deleteAll(userId: string) {
    return prisma.notification.deleteMany({ where: { userId } });
  }
}
