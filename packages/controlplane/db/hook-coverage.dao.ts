import { prisma } from "./client";
import type { HookCoverageInput, HookCoverageVendor } from "@/lib/hook-audit";

export interface HookCoverageRecord extends HookCoverageInput {
  reportedAt: Date;
}

/** The latest coverage report per harness Actor (`lib/hook-audit.ts`, docs/HARNESS_HOOKS.md §6). */
export class HookCoverageDAO {
  static async upsert(actorDid: string, report: HookCoverageInput, reportedAt: Date = new Date()): Promise<void> {
    const data = {
      reportedAt,
      mode: report.mode,
      scope: report.scope,
      tamperResistant: report.tamperResistant,
      vendors: report.vendors as unknown as object,
    };
    await prisma.hookCoverage.upsert({ where: { actorDid }, create: { actorDid, ...data }, update: data });
  }

  static async get(actorDid: string): Promise<HookCoverageRecord | null> {
    const row = await prisma.hookCoverage.findUnique({ where: { actorDid } });
    if (!row) return null;
    return {
      reportedAt: row.reportedAt,
      mode: row.mode as HookCoverageRecord["mode"],
      scope: row.scope as HookCoverageRecord["scope"],
      tamperResistant: row.tamperResistant,
      vendors: (Array.isArray(row.vendors) ? row.vendors : []) as unknown as HookCoverageVendor[],
    };
  }
}
