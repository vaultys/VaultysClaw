import { prisma } from "./client";
import type { ProxyActivityLog } from "@prisma/client";
import type { ProxyActivityLogEntryPayload } from "@vaultysclaw/shared";

export class ProxyActivityLogDAO {
  static async createMany(
    proxyDid: string,
    entries: ProxyActivityLogEntryPayload[]
  ): Promise<void> {
    if (entries.length === 0) return;
    await prisma.proxyActivityLog.createMany({
      data: entries.map((e) => ({
        proxyDid,
        principalDid: e.principalDid ?? null,
        method: e.method,
        url: e.url,
        ruleId: e.ruleId ?? null,
        mode: e.mode,
        verdict: e.verdict,
        reason: e.reason ?? null,
        identitySource: e.identitySource ?? null,
        timestamp: new Date(e.timestamp),
        latencyMs: e.latencyMs,
      })),
    });
  }

  static async query(filter: {
    proxyDid: string;
    principalDid?: string;
    verdict?: "allow" | "deny";
    limit?: number;
    offset?: number;
  }): Promise<{ entries: ProxyActivityLog[]; total: number }> {
    const where = {
      proxyDid: filter.proxyDid,
      ...(filter.principalDid ? { principalDid: filter.principalDid } : {}),
      ...(filter.verdict ? { verdict: filter.verdict } : {}),
    };
    const [entries, total] = await Promise.all([
      prisma.proxyActivityLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
      }),
      prisma.proxyActivityLog.count({ where }),
    ]);
    return { entries, total };
  }
}
