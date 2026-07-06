import { AgentWithInfo } from "@/lib/contracts";
import { prisma } from "./client";
import { Prisma } from "@prisma/client";
import type {
  Agent,
  AgentWorkspace,
  AgentTokenUsage,
  AgentTokenUsageHistory,
  AgentPeerGrant,
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
      capabilities: agent.capabilities,
      certificateData: agent.certificateData ?? null,
      lastSeen: new Date(),
    };
    return prisma.agent.upsert({
      where: { did: agent.did },
      create: { did: agent.did, ...data },
      update: data,
    });
  }

  static async findByDid(did: string): Promise<AgentWithInfo | null> {
    return prisma.agent.findUnique({
      where: { did },
      include: {
        tokenHistory: {
          where: {
            OR: [
              {
                granularity: "day",
                bucket: new Date().toISOString().slice(0, 10),
              },
              {
                granularity: "month",
                bucket: new Date().toISOString().slice(0, 7),
              },
            ],
          },
        },
        agentWorkspaces: {
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                isDefault: true,
              },
            },
          },
        },
        tokenUsage: {
          select: {
            promptTokens: true,
            completionTokens: true,
            updatedAt: true,
          },
        },
      },
    });
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
    search?: string;
    workspace?: string;
    capabilities?: string[];
    page?: number;
    pageSize?: number;
    sortBy?: "name" | "lastSeen" | "registeredAt";
    sortDir?: "asc" | "desc";
    /** When set, only return agents that belong to at least one of these workspace IDs. */
    workspaceIds?: Set<string>;
    /** When set, filter by online status using connected agent DIDs from the WS server. */
    onlineFilter?: boolean;
    onlineDids?: Set<string>;
  }): Promise<{
    agents: AgentWithInfo[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const {
      search,
      workspace,
      capabilities,
      page = 1,
      pageSize = 20,
      sortBy = "lastSeen",
      sortDir = "desc",
      workspaceIds,
      onlineFilter,
      onlineDids,
    } = opts;

    const where: Prisma.AgentWhereInput = {};

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    // Build workspace conditions as an AND list so they can safely compose.
    const workspaceConditions: Prisma.AgentWhereInput[] = [];

    // Explicit workspace slug/id filter from the query string
    if (workspace) {
      workspaceConditions.push({
        agentWorkspaces: {
          some: { workspace: { OR: [{ id: workspace }, { slug: workspace }] } },
        },
      });
    }

    // Authorization: restrict to agents the current user can see.
    // workspaceIds === undefined  → global admin, no restriction.
    // workspaceIds.size === 0     → user has no workspaces, must see nothing.
    // workspaceIds.size > 0       → user can only see agents in those workspaces.
    if (workspaceIds !== undefined) {
      if (workspaceIds.size === 0) {
        where.did = { in: [] }; // short-circuit: no agents visible
      } else {
        workspaceConditions.push({
          agentWorkspaces: { some: { workspaceId: { in: Array.from(workspaceIds) } } },
        });
      }
    }

    if (workspaceConditions.length > 0) {
      where.AND = workspaceConditions;
    }

    if (capabilities && capabilities.length > 0) {
      where.capabilities = { hasSome: capabilities };
    }

    // Online filter is evaluated against live WS state passed from the route
    if (onlineFilter !== undefined && onlineDids !== undefined) {
      const dids = Array.from(onlineDids);
      where.did = onlineFilter ? { in: dids } : { notIn: dids };
    }

    const workspaceInclude = {
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            isDefault: true,
          },
        },
      },
    } as const;

    const [total, agents] = await Promise.all([
      prisma.agent.count({ where }),
      prisma.agent.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tokenHistory: {
            where: {
              OR: [
                {
                  granularity: "day",
                  bucket: new Date().toISOString().slice(0, 10),
                },
                {
                  granularity: "month",
                  bucket: new Date().toISOString().slice(0, 7),
                },
              ],
            },
          },
          agentWorkspaces: workspaceInclude,
          tokenUsage: {
            select: {
              promptTokens: true,
              completionTokens: true,
              updatedAt: true,
            },
          },
        },
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

  static async updateLocation(
    did: string,
    location: { lat: number; lon: number; label: string } | null
  ): Promise<void> {
    await prisma.agent.update({
      where: { did },
      data: {
        locationLat: location?.lat ?? null,
        locationLon: location?.lon ?? null,
        locationLabel: location?.label ?? null,
      },
    });
  }

  static async setLlmConfig(
    did: string,
    config: LlmConfig | null
  ): Promise<void> {
    await prisma.agent.updateMany({
      where: { did },
      data: {
        llmConfig: config
          ? ({ ...config } as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
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

  // ─── Workspace membership ───────────────────────────────────────────────────────

  static async getWorkspaces(agentDid: string): Promise<
    Array<
      AgentWorkspace & {
        workspace: {
          id: string;
          name: string;
          slug: string;
          color: string;
          isDefault: boolean;
        };
      }
    >
  > {
    return prisma.agentWorkspace.findMany({
      where: { agentDid },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            isDefault: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { workspace: { name: "asc" } }],
    }) as any;
  }

  static async addToWorkspace(
    agentDid: string,
    workspaceId: string,
    isPrimary = false
  ): Promise<void> {
    if (isPrimary) {
      await prisma.agentWorkspace.updateMany({
        where: { agentDid },
        data: { isPrimary: false },
      });
    }
    await prisma.agentWorkspace.upsert({
      where: { agentDid_workspaceId: { agentDid, workspaceId } },
      create: { agentDid, workspaceId, isPrimary },
      update: { isPrimary },
    });
  }

  static async removeFromWorkspace(
    agentDid: string,
    workspaceId: string
  ): Promise<boolean> {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (workspace?.isDefault) return false;
    const result = await prisma.agentWorkspace.deleteMany({
      where: { agentDid, workspaceId },
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
        INSERT INTO "AgentTokenUsageHistory" ("agentDid", "bucket", "granularity", "promptTokens", "completionTokens", "updatedAt")
        VALUES (${agentDid}, ${dayBucket}, 'day', ${promptDelta}, ${completionDelta}, NOW())
        ON CONFLICT ("agentDid", "bucket", "granularity") DO UPDATE SET
          "promptTokens" = "AgentTokenUsageHistory"."promptTokens" + ${promptDelta},
          "completionTokens" = "AgentTokenUsageHistory"."completionTokens" + ${completionDelta},
          "updatedAt" = NOW()
      `,
      prisma.$executeRaw`
        INSERT INTO "AgentTokenUsageHistory" ("agentDid", "bucket", "granularity", "promptTokens", "completionTokens", "updatedAt")
        VALUES (${agentDid}, ${monthBucket}, 'month', ${promptDelta}, ${completionDelta}, NOW())
        ON CONFLICT ("agentDid", "bucket", "granularity") DO UPDATE SET
          "promptTokens" = "AgentTokenUsageHistory"."promptTokens" + ${promptDelta},
          "completionTokens" = "AgentTokenUsageHistory"."completionTokens" + ${completionDelta},
          "updatedAt" = NOW()
      `,
    ]);
  }

  static async getTokenBuckets(
    agentDid: string,
    dayBucket: string,
    monthBucket: string
  ): Promise<{ todayTokens: number; monthTokens: number }> {
    const [todayRow, monthRow] = await Promise.all([
      prisma.agentTokenUsageHistory.findUnique({
        where: {
          agentDid_bucket_granularity: {
            agentDid,
            bucket: dayBucket,
            granularity: "day",
          },
        },
        select: { promptTokens: true, completionTokens: true },
      }),
      prisma.agentTokenUsageHistory.findUnique({
        where: {
          agentDid_bucket_granularity: {
            agentDid,
            bucket: monthBucket,
            granularity: "month",
          },
        },
        select: { promptTokens: true, completionTokens: true },
      }),
    ]);
    return {
      todayTokens: todayRow
        ? todayRow.promptTokens + todayRow.completionTokens
        : 0,
      monthTokens: monthRow
        ? monthRow.promptTokens + monthRow.completionTokens
        : 0,
    };
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

  static async updateDailyPriceSpent(
    agentDid: string,
    priceSpent: number
  ): Promise<Agent> {
    return prisma.agent.update({
      where: { did: agentDid },
      data: { dailyPriceSpent: priceSpent },
    });
  }

  // ─── LiteLLM per-agent key ───────────────────────────────────────────────────

  static async updateLiteLLMKey(
    agentDid: string,
    virtualKey: string,
    allowedModels: string[],
    dailyBudget?: number
  ): Promise<void> {
    await prisma.agent.update({
      where: { did: agentDid },
      data: {
        litellmVirtualKey: virtualKey,
        litellmAllowedModels: allowedModels as Prisma.InputJsonValue,
        litellmDailyBudget: dailyBudget ?? null,
        litellmKeyUpdatedAt: new Date(),
      },
    });
  }

  static async clearLiteLLMKey(agentDid: string): Promise<void> {
    await prisma.agent.update({
      where: { did: agentDid },
      data: {
        litellmVirtualKey: null,
        litellmAllowedModels: [] as Prisma.InputJsonValue,
        litellmDailyBudget: null,
        litellmKeyUpdatedAt: null,
      },
    });
  }
}
