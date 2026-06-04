import { prisma } from "./client";
import type { UserGrant, DelegationCert } from "@prisma/client";

export class GrantDAO {
  static async create(data: {
    id: string;
    userDid: string;
    agentDid?: string;
    capabilities: string[];
    grantedBy: string;
    expiresAt?: string;
  }): Promise<UserGrant> {
    return prisma.userGrant.create({
      data: {
        ...data,
        agentDid: data.agentDid ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  }

  static async findById(id: string): Promise<UserGrant | null> {
    return prisma.userGrant.findUnique({ where: { id } });
  }

  static async listByUser(userDid: string): Promise<UserGrant[]> {
    return prisma.userGrant.findMany({
      where: { userDid },
      orderBy: { createdAt: "desc" },
    });
  }

  static async listByAgent(agentDid: string): Promise<UserGrant[]> {
    return prisma.userGrant.findMany({
      where: { OR: [{ agentDid }, { agentDid: null }] },
      orderBy: { createdAt: "desc" },
    });
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.userGrant.deleteMany({ where: { id } });
    return result.count > 0;
  }
}

export class DelegationCertDAO {
  static async create(data: {
    id: string;
    grantId: string;
    userDid: string;
    agentDid: string;
    capabilities: string[];
    certificate: string;
    expiresAt?: string;
  }): Promise<DelegationCert> {
    return prisma.delegationCert.create({
      data: {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  }

  static async findById(id: string): Promise<DelegationCert | null> {
    return prisma.delegationCert.findUnique({ where: { id } });
  }

  static async listByUser(userDid: string): Promise<DelegationCert[]> {
    return prisma.delegationCert.findMany({
      where: { userDid },
      orderBy: { createdAt: "desc" },
    });
  }

  static async listByAgent(agentDid: string): Promise<DelegationCert[]> {
    return prisma.delegationCert.findMany({
      where: { agentDid },
      orderBy: { createdAt: "desc" },
    });
  }

  static async listByGrant(grantId: string): Promise<DelegationCert[]> {
    return prisma.delegationCert.findMany({ where: { grantId } });
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.delegationCert.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
