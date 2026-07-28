import { prisma } from "./client";
import type { ProxyPrincipal } from "@prisma/client";

export class ProxyPrincipalDAO {
  /**
   * Called when an activity-log batch references a `principalDid` not yet
   * known to this proxy. Creates it as `pending` with no governance rules if
   * new; otherwise just bumps `lastSeenAt` (never downgrades an already
   * `active`/`revoked` principal).
   */
  static async upsertPending(
    proxyDid: string,
    did: string,
    options?: { externalId?: string; provisionedByProxy?: boolean }
  ): Promise<ProxyPrincipal> {
    return prisma.proxyPrincipal.upsert({
      where: { proxyDid_did: { proxyDid, did } },
      create: {
        proxyDid,
        did,
        externalId: options?.externalId ?? null,
        provisionedByProxy: options?.provisionedByProxy ?? false,
        status: "pending",
      },
      update: { lastSeenAt: new Date() },
    });
  }

  static async listByProxy(proxyDid: string): Promise<ProxyPrincipal[]> {
    return prisma.proxyPrincipal.findMany({
      where: { proxyDid },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  /** Count of principals still awaiting admin review for one proxy. */
  static async countPending(proxyDid: string): Promise<number> {
    return prisma.proxyPrincipal.count({ where: { proxyDid, status: "pending" } });
  }

  /** Pending-principal count for every proxy at once, keyed by proxyDid — one
   * query for the proxies list page instead of N. */
  static async countPendingByProxy(): Promise<Map<string, number>> {
    const rows = await prisma.proxyPrincipal.groupBy({
      by: ["proxyDid"],
      where: { status: "pending" },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.proxyDid, r._count._all]));
  }

  /** Total pending-principal count across every proxy — drives the sidebar/nav badge. */
  static async countPendingAll(): Promise<number> {
    return prisma.proxyPrincipal.count({ where: { status: "pending" } });
  }

  static async findByProxyAndDid(
    proxyDid: string,
    did: string
  ): Promise<ProxyPrincipal | null> {
    return prisma.proxyPrincipal.findUnique({
      where: { proxyDid_did: { proxyDid, did } },
    });
  }

  static async update(
    id: string,
    data: {
      tag?: string | null;
      governanceRules?: string[];
      status?: "pending" | "active" | "revoked";
    }
  ): Promise<ProxyPrincipal> {
    return prisma.proxyPrincipal.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.proxyPrincipal.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
