import { prisma } from "./client";
import type {
  Realm,
  RealmTokenUsage,
  RealmRouterKey,
  Prisma,
} from "@prisma/client";

export class RealmDAO {
  static async findAll(): Promise<Realm[]> {
    return prisma.realm.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  static async findById(id: string): Promise<Realm | null> {
    return prisma.realm.findUnique({ where: { id } });
  }

  static async findBySlug(slug: string): Promise<Realm | null> {
    return prisma.realm.findUnique({ where: { slug } });
  }

  static async findDefault(): Promise<Realm | null> {
    return prisma.realm.findFirst({ where: { isDefault: true } });
  }

  static async create(data: {
    name: string;
    slug: string;
    description?: string;
    color?: string;
  }): Promise<Realm> {
    const id = crypto.randomUUID();
    return prisma.realm.create({
      data: {
        id,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        color: data.color ?? "#6366f1",
      },
    });
  }

  static async update(
    id: string,
    updates: Partial<{
      name: string;
      slug: string;
      description: string | null;
      color: string;
      llmConfig: Prisma.InputJsonValue | null;
      defaultCapabilities: Prisma.InputJsonValue;
      tokenBudgetDaily: number | null;
      tokenBudgetMonthly: number | null;
      allowedCapabilities: Prisma.InputJsonValue | null;
    }>
  ): Promise<void> {
    await prisma.realm.update({
      where: { id },
      data: updates as Prisma.RealmUpdateInput,
    });
  }

  static async delete(id: string): Promise<boolean> {
    const realm = await prisma.realm.findUnique({ where: { id } });
    if (!realm || realm.isDefault) return false;
    await prisma.realm.delete({ where: { id } });
    return true;
  }

  static async setDefault(id: string): Promise<void> {
    await prisma.$transaction([
      prisma.realm.updateMany({ data: { isDefault: false } }),
      prisma.realm.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  // ─── Agent membership ───────────────────────────────────────────────────────

  static async getAgents(realmId: string) {
    return prisma.agentRealm.findMany({
      where: { realmId },
      include: {
        agent: true,
        realm: true,
      },
      orderBy: [{ isPrimary: "desc" }, { agent: { name: "asc" } }],
    });
  }

  // ─── User membership ────────────────────────────────────────────────────────

  static async getUsers(realmId: string) {
    return prisma.userRealm.findMany({
      where: { realmId },
      include: {
        user: { select: { id: true, did: true, name: true, email: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { user: { name: "asc" } }],
    });
  }

  static async isUserInRealm(
    userId: string,
    realmId: string
  ): Promise<boolean> {
    const row = await prisma.userRealm.findUnique({
      where: { userId_realmId: { userId, realmId } },
    });
    return row !== null;
  }

  static async isUserRealmAdmin(
    userId: string,
    realmId: string
  ): Promise<boolean> {
    const row = await prisma.userRealm.findUnique({
      where: { userId_realmId: { userId, realmId } },
    });
    return row?.isRealmAdmin ?? false;
  }

  static async setUserRealmAdmin(
    userId: string,
    realmId: string,
    isAdmin: boolean
  ): Promise<boolean> {
    const result = await prisma.userRealm.updateMany({
      where: { userId, realmId },
      data: { isRealmAdmin: isAdmin },
    });
    return result.count > 0;
  }

  static async addUserToRealm(
    userId: string,
    realmId: string,
    isPrimary = false,
    isRealmAdmin = false
  ): Promise<void> {
    if (isPrimary) {
      await prisma.userRealm.updateMany({
        where: { userId },
        data: { isPrimary: false },
      });
    }
    await prisma.userRealm.upsert({
      where: { userId_realmId: { userId, realmId } },
      create: { userId, realmId, isPrimary, isRealmAdmin },
      update: { isPrimary, isRealmAdmin },
    });
  }

  static async removeUserFromRealm(
    userId: string,
    realmId: string
  ): Promise<boolean> {
    const realm = await prisma.realm.findUnique({ where: { id: realmId } });
    if (realm?.isDefault) return false;
    const result = await prisma.userRealm.deleteMany({
      where: { userId, realmId },
    });
    return result.count > 0;
  }

  static async getUserRealms(userId: string) {
    return prisma.userRealm.findMany({
      where: { userId },
      include: {
        realm: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            isDefault: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { realm: { name: "asc" } }],
    });
  }

  static async enrollInDefault(
    type: "agent" | "user",
    did: string
  ): Promise<void> {
    const realm = await RealmDAO.findDefault();
    if (!realm) return;
    if (type === "agent") {
      const { AgentDAO } = await import("./agent.dao");
      await AgentDAO.addToRealm(did, realm.id, true);
    } else {
      await RealmDAO.addUserToRealm(did, realm.id, true);
    }
  }

  // ─── Token usage ────────────────────────────────────────────────────────────

  static async getTokenUsage(realmId: string): Promise<RealmTokenUsage | null> {
    return prisma.realmTokenUsage.findUnique({ where: { realmId } });
  }

  static async upsertTokenUsage(
    realmId: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<void> {
    await prisma.realmTokenUsage.upsert({
      where: { realmId },
      create: { realmId, promptTokens, completionTokens },
      update: { promptTokens, completionTokens, updatedAt: new Date() },
    });
  }

  // ─── Router keys ────────────────────────────────────────────────────────────

  static async getRouterKey(realmId: string): Promise<RealmRouterKey | null> {
    return prisma.realmRouterKey.findUnique({ where: { realmId } });
  }

  static async upsertRouterKey(
    realmId: string,
    data: {
      litellmVirtualKey?: string;
      allowedModelIds?: string[];
      monthlyBudgetUsd?: number | null;
    }
  ): Promise<void> {
    await prisma.realmRouterKey.upsert({
      where: { realmId },
      create: {
        realmId,
        litellmVirtualKey: data.litellmVirtualKey ?? null,
        allowedModelIds: data.allowedModelIds ?? [],
        monthlyBudgetUsd: data.monthlyBudgetUsd ?? null,
      },
      update: {
        ...(data.litellmVirtualKey !== undefined && {
          litellmVirtualKey: data.litellmVirtualKey,
        }),
        ...(data.allowedModelIds !== undefined && {
          allowedModelIds: data.allowedModelIds,
        }),
        ...(data.monthlyBudgetUsd !== undefined && {
          monthlyBudgetUsd: data.monthlyBudgetUsd,
        }),
        updatedAt: new Date(),
      },
    });
  }
}
