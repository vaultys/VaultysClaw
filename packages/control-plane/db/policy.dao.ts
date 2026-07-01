import { prisma } from "./client";
import type { Policy, Prisma } from "@prisma/client";

export class PolicyDAO {
  static async create(policy: {
    agentDid?: string;
    workspaceId?: string;
    capabilities: string[];
    resourceLimits?: Record<string, unknown>;
    expiresAt?: string;
    createdBy?: string;
  }): Promise<Policy> {
    const id = `policy-${crypto.randomUUID()}`;
    return prisma.policy.create({
      data: {
        id,
        agentDid: policy.agentDid ?? null,
        workspaceId: policy.workspaceId ?? null,
        capabilities: policy.capabilities,
        resourceLimits: policy.resourceLimits as Prisma.InputJsonValue,
        expiresAt: policy.expiresAt ? new Date(policy.expiresAt) : null,
        createdBy: policy.createdBy ?? null,
      },
    });
  }

  static async findById(id: string): Promise<Policy | null> {
    return prisma.policy.findUnique({ where: { id } });
  }

  static async list(
    opts: {
      agentDid?: string;
      workspaceId?: string;
      includeExpired?: boolean;
      expiredOnly?: boolean;
    } = {}
  ): Promise<Policy[]> {
    const where: Prisma.PolicyWhereInput = {};
    if (opts.agentDid !== undefined) where.agentDid = opts.agentDid;
    if (opts.workspaceId !== undefined) where.workspaceId = opts.workspaceId;

    if (opts.expiredOnly) {
      where.expiresAt = { not: null, lt: new Date() };
    } else if (!opts.includeExpired) {
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }

    return prisma.policy.findMany({ where, orderBy: { createdAt: "desc" } });
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.policy.deleteMany({ where: { id } });
    return result.count > 0;
  }

  static async countByAgent(): Promise<
    Array<{ agentDid: string; count: number }>
  > {
    const rows = await prisma.policy.groupBy({
      by: ["agentDid"],
      where: {
        agentDid: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      _count: { id: true },
    });
    return rows
      .filter((r) => r.agentDid !== null)
      .map((r) => ({ agentDid: r.agentDid as string, count: r._count.id }));
  }
}
