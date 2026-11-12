import { prisma } from "./client";
import type { HookAuditEvent } from "@prisma/client";
import type { HookAuditInput } from "@/lib/hook-audit";

/**
 * vaultysclaw-hooks decisions reported by a `kind: "harness"` Actor
 * (`lib/hook-audit.ts`, docs/HARNESS_HOOKS.md). Append-only: nothing updates or
 * deletes a row except the cascade from its Actor.
 */
export class HookAuditDAO {
  /** Insert a validated batch. Returns how many rows were new — a re-sent batch counts 0. */
  static async insertMany(actorDid: string, events: HookAuditInput[]): Promise<number> {
    if (events.length === 0) return 0;
    const result = await prisma.hookAuditEvent.createMany({
      data: events.map((e) => ({ actorDid, ...e })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /** The most recent events for one Actor, newest first. */
  static async recent(
    actorDid: string,
    opts: { limit?: number; decisionsOnly?: boolean } = {}
  ): Promise<HookAuditEvent[]> {
    return prisma.hookAuditEvent.findMany({
      where: { actorDid, ...(opts.decisionsOnly ? { decided: true } : {}) },
      orderBy: { occurredAt: "desc" },
      take: Math.min(opts.limit ?? 50, 500),
    });
  }

  /** Decision counts for one Actor since a point in time, for the panel's summary line. */
  static async summary(
    actorDid: string,
    since: Date
  ): Promise<{ decided: number; blocked: number; wouldDeny: number; unmapped: number; lastAt: Date | null }> {
    const where = { actorDid, decided: true, occurredAt: { gte: since } };
    const [decided, blocked, wouldDeny, unmapped, last] = await Promise.all([
      prisma.hookAuditEvent.count({ where }),
      prisma.hookAuditEvent.count({ where: { ...where, blocked: true } }),
      prisma.hookAuditEvent.count({ where: { ...where, wouldDeny: true } }),
      prisma.hookAuditEvent.count({ where: { ...where, unmapped: true } }),
      prisma.hookAuditEvent.findFirst({ where: { actorDid }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
    ]);
    return { decided, blocked, wouldDeny, unmapped, lastAt: last?.occurredAt ?? null };
  }
}
