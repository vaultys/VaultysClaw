import { prisma } from "./client";
import type { HookAuditEvent } from "@prisma/client";
import type { HookAuditInput } from "@/lib/hook-audit";

/**
 * vaultysclaw-hooks decisions reported by a `kind: "harness"` Actor
 * (`lib/hook-audit.ts`, docs/HARNESS_HOOKS.md). Append-only: nothing updates or
 * deletes a row except the cascade from its Actor.
 */
export class HookAuditDAO {
  /**
   * Insert a validated batch and return the rows that were new — a re-sent
   * batch returns none, which is what keeps a redelivery from re-raising its
   * `harness.tool_denied` events.
   */
  static async insertMany(actorDid: string, events: HookAuditInput[]): Promise<HookAuditEvent[]> {
    if (events.length === 0) return [];
    return prisma.hookAuditEvent.createManyAndReturn({
      data: events.map((e) => ({ actorDid, ...e })),
      skipDuplicates: true,
    });
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
