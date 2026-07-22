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
