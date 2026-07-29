import { prisma } from "./client";
import type { Proxy } from "@prisma/client";

export class ProxyDAO {
  static async upsert(proxy: {
    did: string;
    name: string;
    publicKey?: string;
  }): Promise<Proxy> {
    const data = {
      name: proxy.name,
      publicKey: proxy.publicKey ?? null,
      lastSeen: new Date(),
    };
    return prisma.proxy.upsert({
      where: { did: proxy.did },
      create: { did: proxy.did, ...data },
      update: data,
    });
  }

  static async findByDid(did: string): Promise<Proxy | null> {
    return prisma.proxy.findUnique({ where: { did } });
  }

  static async findByName(name: string): Promise<Proxy | null> {
    return prisma.proxy.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      orderBy: { registeredAt: "desc" },
    });
  }

  static async findAll(): Promise<Proxy[]> {
    return prisma.proxy.findMany({ orderBy: { registeredAt: "desc" } });
  }

  static async updateDefaultMode(
    did: string,
    defaultMode: "passthrough" | "deny"
  ): Promise<Proxy> {
    return prisma.proxy.update({ where: { did }, data: { defaultMode } });
  }

  static async updateLastSeen(did: string): Promise<void> {
    await prisma.proxy.updateMany({
      where: { did },
      data: { lastSeen: new Date() },
    });
  }

  static async delete(did: string): Promise<boolean> {
    const result = await prisma.proxy.deleteMany({ where: { did } });
    return result.count > 0;
  }
}
