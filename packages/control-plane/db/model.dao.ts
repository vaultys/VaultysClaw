import { prisma } from "./client";
import type {
  ModelRegistry,
  ModelRealmAccess,
  RealmRouterKey,
  Prisma,
} from "@prisma/client";
import type { ModelWithRealmAccess } from "@/lib/contracts";

export class ModelDAO {
  static async create(entry: {
    name: string;
    description?: string;
    provider: string;
    modelId: string;
    baseUrl: string;
    apiKeyEnc?: string;
    createdBy?: string;
  }): Promise<ModelRegistry> {
    const id = crypto.randomUUID();
    const litellmModelName = `${entry.provider}/${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return prisma.modelRegistry.create({
      data: {
        id,
        name: entry.name,
        description: entry.description ?? null,
        provider: entry.provider,
        modelId: entry.modelId,
        baseUrl: entry.baseUrl,
        apiKeyEnc: entry.apiKeyEnc ?? null,
        litellmModelName,
        createdBy: entry.createdBy ?? null,
      },
    });
  }

  static async findById(id: string): Promise<ModelRegistry | null> {
    return prisma.modelRegistry.findUnique({ where: { id } });
  }

  /**
   * List every model registry entry with its realm-access rows joined in — a
   * single query that returns exactly what the models API needs (the
   * `apiKeyEnc` secret is excluded by the `select`). The select must stay in
   * sync with the `ModelWithRealmAccess` type in `models.contract.ts`.
   */
  static async findAll(): Promise<ModelWithRealmAccess[]> {
    return prisma.modelRegistry.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        provider: true,
        modelId: true,
        baseUrl: true,
        litellmModelName: true,
        status: true,
        metadata: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        realmAccess: true,
      },
    });
  }

  static async findByRealm(realmId: string): Promise<ModelRegistry[]> {
    return prisma.modelRegistry.findMany({
      where: {
        status: "active",
        realmAccess: { some: { realmId } },
      },
      orderBy: { name: "asc" },
    });
  }

  static async update(
    id: string,
    updates: Partial<{
      name: string;
      description: string | null;
      provider: string;
      modelId: string;
      baseUrl: string;
      apiKeyEnc: string | null;
      status: "active" | "inactive";
      litellmModelName: string | null;
      metadata: Prisma.InputJsonValue;
    }>
  ): Promise<void> {
    await prisma.modelRegistry.update({ where: { id }, data: updates });
  }

  static async delete(id: string): Promise<void> {
    await prisma.modelRegistry.delete({ where: { id } });
  }

  // ─── Realm access ────────────────────────────────────────────────────────────

  static async getRealmAccess(modelId: string): Promise<ModelRealmAccess[]> {
    return prisma.modelRealmAccess.findMany({ where: { modelId } });
  }

  static async grantRealmAccess(
    modelId: string,
    realmId: string
  ): Promise<void> {
    await prisma.modelRealmAccess.upsert({
      where: { modelId_realmId: { modelId, realmId } },
      create: { modelId, realmId },
      update: {},
    });
  }

  static async revokeRealmAccess(
    modelId: string,
    realmId: string
  ): Promise<void> {
    await prisma.modelRealmAccess.deleteMany({ where: { modelId, realmId } });
  }
}
