import { prisma } from "./client";
import type { AuditLogEntry, Prisma } from "@prisma/client";

export interface AuditLogFilter {
  eventType?: string;
  actorDid?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
}

function whereFromFilter(filter?: AuditLogFilter): Prisma.AuditLogEntryWhereInput {
  if (!filter) return {};
  return {
    eventType: filter.eventType || undefined,
    actorDid: filter.actorDid || undefined,
    targetType: filter.targetType || undefined,
    targetId: filter.targetId || undefined,
    createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
}

/** Append-only, deliberately — no `update`/`delete` method exists here at all (docs/PAGE_DESIGN.md
 *  §1.6: "no edit or delete action exists on this page, full stop"). */
export class AuditLogDAO {
  static async create(data: {
    eventType: string;
    actorDid?: string | null;
    actorName?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    details: unknown;
  }): Promise<AuditLogEntry> {
    return prisma.auditLogEntry.create({
      data: {
        eventType: data.eventType,
        actorDid: data.actorDid ?? null,
        actorName: data.actorName ?? null,
        targetType: data.targetType ?? null,
        targetId: data.targetId ?? null,
        details: data.details as Prisma.InputJsonValue,
      },
    });
  }

  static async list(filter?: AuditLogFilter, limit = 50): Promise<AuditLogEntry[]> {
    return prisma.auditLogEntry.findMany({
      where: whereFromFilter(filter),
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async recent(limit = 20): Promise<AuditLogEntry[]> {
    return prisma.auditLogEntry.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }

  static async count(filter?: AuditLogFilter): Promise<number> {
    return prisma.auditLogEntry.count({ where: whereFromFilter(filter) });
  }

  /** Distinct event types actually present, for the filter dropdown — not the full static
   *  catalog, so an admin never sees a filter option that would always return zero rows. */
  static async distinctEventTypes(): Promise<string[]> {
    const rows = await prisma.auditLogEntry.findMany({
      distinct: ["eventType"],
      select: { eventType: true },
      orderBy: { eventType: "asc" },
    });
    return rows.map((r) => r.eventType);
  }
}
