import { prisma } from "./client";
import type { ProxyUpstream } from "@prisma/client";

export class ProxyUpstreamDAO {
  static async create(data: {
    proxyDid: string;
    name: string;
    baseUrl: string;
  }): Promise<ProxyUpstream> {
    return prisma.proxyUpstream.create({ data });
  }

  static async listByProxy(proxyDid: string): Promise<ProxyUpstream[]> {
    return prisma.proxyUpstream.findMany({ where: { proxyDid } });
  }

  static async update(
    id: string,
    data: { name?: string; baseUrl?: string }
  ): Promise<ProxyUpstream> {
    return prisma.proxyUpstream.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.proxyUpstream.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
