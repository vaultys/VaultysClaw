import { prisma } from "./client";
import type { ApiKey } from "@prisma/client";

export class ApiKeyDAO {
  static async create(data: {
    id: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    allowedRoutes?: string[];
    realmId?: string;
    isRealmAdmin?: boolean;
    createdBy: string;
    expiresAt?: Date;
  }): Promise<ApiKey> {
    return prisma.apiKey.create({
      data: {
        id: data.id,
        name: data.name,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        allowedRoutes: data.allowedRoutes ?? [],
        realmId: data.realmId ?? null,
        isRealmAdmin: data.isRealmAdmin ?? false,
        createdBy: data.createdBy,
        expiresAt: data.expiresAt ?? null,
      },
    });
  }

  static async findById(id: string): Promise<ApiKey | null> {
    return prisma.apiKey.findUnique({ where: { id } });
  }

  static async findByHash(keyHash: string): Promise<ApiKey | null> {
    return prisma.apiKey.findUnique({ where: { keyHash } });
  }

  static async findAll(): Promise<ApiKey[]> {
    return prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  }

  static async update(
    id: string,
    data: {
      name?: string;
      allowedRoutes?: string[];
      realmId?: string | null;
      isRealmAdmin?: boolean;
      expiresAt?: Date | null;
      isActive?: boolean;
    }
  ): Promise<ApiKey> {
    return prisma.apiKey.update({ where: { id }, data });
  }

  static async updateLastUsed(id: string): Promise<void> {
    await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  static async deactivate(id: string): Promise<boolean> {
    const result = await prisma.apiKey.updateMany({ where: { id }, data: { isActive: false } });
    return result.count > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.apiKey.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
