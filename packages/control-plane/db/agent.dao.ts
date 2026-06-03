import { prisma } from "./client";
import type {
  Agent,
  AgentRealm,
  AgentTokenUsage,
  AgentTokenUsageHistory,
  AgentPeerGrant,
  Prisma,
} from "@prisma/client";
import type { LlmConfig } from "@vaultysclaw/shared";

export class AgentDAO {
  // ─── CRUD ───────────────────────────────────────────────────────────────────

  static async upsert(agent: {
    did: string;
    name: string;
    publicKey?: string;
    capabilities: string[];
    certificateData?: string;
  }): Promise<Agent> {
    const data = {
      name: agent.name,
      publicKey: agent.publicKey ?? null,
      capabilities: agent.capabilities as Prisma.InputJsonValue,
      certificateData: agent.certificateData ?? null,
      lastSeen: new Date(),
    };
    return prisma.agent.upsert({
      where: { did: agent.did },
      create: { did: agent.did, ...data },
      update: data,
    });
  }

  static async findByDid(did: string): Promise<Agent | null> {
    return prisma.agent.findUnique({ where: { did } });
  }

  static async findByName(name: string): Promise<Agent | null> {
    return prisma.agent.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
  }

  static async findAll(): Promise<Agent[]> {
    return prisma.agent.findMany({ orderBy: { lastSeen: "desc" } });
  }

  static async query(opts: {
    q?: string;
    realm?: string;
    capabilities?: string[];
    page?: number;
    pageSize?: number;
    sortBy?: "name" | "lastSeen" | "registeredAt";
    sortDir?: "asc" | "desc";
  }): Promise<{
    agents: Agent[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const {
      q,
      realm,
      capabilities,
      page = 1,
      pageSize = 20,
      sortBy = "lastSeen",
      sortDir = "desc",
    } = opts;

    const where: Prisma.AgentWhereInput = {};

    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    if (realm) {
      where.agentRealms = {
        some: {
          realm: { OR: [{ id: realm }, { slug: realm }] },
        },
      };
    }

    // For capabilities array filtering: use raw query in PostgreSQL JSONB
    // We apply it as a post-filter if needed, or via raw query
    const orderBy: Prisma.AgentOrderByWithRelationInput =
      sortBy === "name"
        ? { name: sortDir }
        : sortBy === "registeredAt"
          ? { registeredAt: sortDir }
          : { lastSeen: sortDir };

    if (capabilities && capabilities.length > 0) {
      // Use raw for JSONB capability filtering
      const capConditions = capabilities
        .map((_, i) => `capabilities @> $${i + 1}::jsonb`)
        .join(" AND ");
      const capParams = capabilities.map((c) => JSON.stringify([c]));

      const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*)::bigint as count FROM agents a WHERE ${capConditions}`,
        ...capParams
      );
      const total = Number(countResult[0].count);
      const offset = (page - 1) * pageSize;
      const agents = await prisma.$queryRawUnsafe<Agent[]>(
        `SELECT * FROM agents a WHERE ${capConditions} ORDER BY ${sortBy === "name" ? "name" : sortBy === "registeredAt" ? "registered_at" : "last_seen"} ${sortDir.toUpperCase()} LIMIT ${pageSize} OFFSET ${offset}`,
        ...capParams
      );
      return {
        agents,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    const [total, agents] = await Promise.all([
      prisma.agent.count({ where }),
      prisma.agent.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      agents,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  static async updateLastSeen(did: string): Promise<void> {
    await prisma.agent.update({
      where: { did },
      data: { lastSeen: new Date() },
    });
  }

  static async setLlmConfig(
    did: string,
    config: LlmConfig | null
  ): Promise<void> {
    await prisma.agent.update({
      where: { did },
      data: { llmConfig: { ...config } },
    });
  }

  static async updateBudget(
    did: string,
    budgets: {
      tokenBudgetDaily?: number | null;
      tokenBudgetMonthly?: number | null;
    }
  ): Promise<void> {
    await prisma.agent.update({ where: { did }, data: budgets });
  }

  static async delete(did: string): Promise<void> {
    await prisma.agent.delete({ where: { did } });
  }

  // ─── Realm membership ───────────────────────────────────────────────────────

  static async getRealms(
    agentDid: string
  ): Promise<
    Array<
      AgentRealm & {
        realm: {
          id: string;
          name: string;
          slug: string;
          color: string;
          isDefault: boolean;
        };
      }
    >
  > {
    return prisma.agentRealm.findMany({
      where: { agentDid },
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
    }) as any;
  }

  static async addToRealm(
    agentDid: string,
    realmId: string,
    isPrimary = false
  ): Promise<void> {
    if (isPrimary) {
      await prisma.agentRealm.updateMany({
        where: { agentDid },
        data: { isPrimary: false },
      });
    }
    await prisma.agentRealm.upsert({
      where: { agentDid_realmId: { agentDid, realmId } },
      create: { agentDid, realmId, isPrimary },
      update: { isPrimary },
    });
  }

  static async removeFromRealm(
    agentDid: string,
    realmId: string
  ): Promise<boolean> {
    const realm = await prisma.realm.findUnique({ where: { id: realmId } });
    if (realm?.isDefault) return false;
    const result = await prisma.agentRealm.deleteMany({
      where: { agentDid, realmId },
    });
    return result.count > 0;
  }

  // ─── Token usage ────────────────────────────────────────────────────────────

  static async getTokenUsage(
    agentDid: string
  ): Promise<AgentTokenUsage | null> {
    return prisma.agentTokenUsage.findUnique({ where: { agentDid } });
  }

  static async getAllTokenUsage(): Promise<AgentTokenUsage[]> {
    return prisma.agentTokenUsage.findMany({ orderBy: { updatedAt: "desc" } });
  }

  static async upsertTokenUsage(
    agentDid: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<void> {
    await prisma.agentTokenUsage.upsert({
      where: { agentDid },
      create: { agentDid, promptTokens, completionTokens },
      update: { promptTokens, completionTokens, updatedAt: new Date() },
    });
  }

  static async getTotalFleetTokenUsage(): Promise<{
    promptTokens: number;
    completionTokens: number;
  }> {
    const result = await prisma.agentTokenUsage.aggregate({
      _sum: { promptTokens: true, completionTokens: true },
    });
    return {
      promptTokens: result._sum.promptTokens ?? 0,
      completionTokens: result._sum.completionTokens ?? 0,
    };
  }

  static async addTokenUsageHistory(
    agentDid: string,
    promptDelta: number,
    completionDelta: number
  ): Promise<void> {
    if (promptDelta <= 0 && completionDelta <= 0) return;
    const now = new Date();
    const dayBucket = now.toISOString().slice(0, 10);
    const monthBucket = now.toISOString().slice(0, 7);

    await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO agent_token_usage_history (agent_did, bucket, granularity, prompt_tokens, completion_tokens, updated_at)
        VALUES (${agentDid}, ${dayBucket}, 'day', ${promptDelta}, ${completionDelta}, NOW())
        ON CONFLICT (agent_did, bucket, granularity) DO UPDATE SET
          prompt_tokens = agent_token_usage_history.prompt_tokens + ${promptDelta},
          completion_tokens = agent_token_usage_history.completion_tokens + ${completionDelta},
          updated_at = NOW()
      `,
      prisma.$executeRaw`
        INSERT INTO agent_token_usage_history (agent_did, bucket, granularity, prompt_tokens, completion_tokens, updated_at)
        VALUES (${agentDid}, ${monthBucket}, 'month', ${promptDelta}, ${completionDelta}, NOW())
        ON CONFLICT (agent_did, bucket, granularity) DO UPDATE SET
          prompt_tokens = agent_token_usage_history.prompt_tokens + ${promptDelta},
          completion_tokens = agent_token_usage_history.completion_tokens + ${completionDelta},
          updated_at = NOW()
      `,
    ]);
  }

  static async getTokenUsageHistory(
    agentDid: string,
    granularity: "day" | "month",
    from: string,
    to: string
  ): Promise<AgentTokenUsageHistory[]> {
    return prisma.agentTokenUsageHistory.findMany({
      where: {
        agentDid,
        granularity,
        bucket: { gte: from, lte: to },
      },
      orderBy: { bucket: "asc" },
    });
  }

  // ─── Peer grants ────────────────────────────────────────────────────────────

  static async findPeerGrants(sourceDid: string): Promise<AgentPeerGrant[]> {
    return prisma.agentPeerGrant.findMany({ where: { sourceDid } });
  }

  static async createPeerGrant(data: {
    id: string;
    sourceDid: string;
    targetDid: string;
    targetName: string;
    skillDescription: string;
    capabilities: string[];
    certificate: string;
    expiresAt?: string;
  }): Promise<AgentPeerGrant> {
    return prisma.agentPeerGrant.create({
      data: {
        ...data,
        capabilities: data.capabilities,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  }
}
