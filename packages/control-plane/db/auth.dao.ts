import { prisma } from "./client";
import type { AuthSession, Certificate, PendingRegistration } from "@prisma/client";

// ─── Auth Sessions ────────────────────────────────────────────────────────────

export class AuthSessionDAO {
  static async create(id: string, sessionKey: string): Promise<void> {
    await prisma.authSession.create({ data: { id, sessionKey } });
  }

  static async findById(id: string): Promise<AuthSession | null> {
    return prisma.authSession.findUnique({ where: { id } });
  }

  static async update(
    id: string,
    data: { certificateData?: string; status?: number; agentDid?: string }
  ): Promise<void> {
    await prisma.authSession.update({ where: { id }, data });
  }

  static async deleteExpired(maxAgeSeconds: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);
    const result = await prisma.authSession.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}

// ─── Certificates ─────────────────────────────────────────────────────────────

export class CertificateDAO {
  static async create(data: {
    id: string;
    key: string;
    registration?: string;
    connection?: string;
    register?: number;
    data?: string;
    metadata?: string;
  }): Promise<Certificate> {
    return prisma.certificate.create({ data: { ...data } });
  }

  static async findById(id: string): Promise<Certificate | null> {
    return prisma.certificate.findUnique({ where: { id } });
  }

  static async findByRegistration(registration: string): Promise<Certificate | null> {
    return prisma.certificate.findUnique({ where: { registration } });
  }

  static async findByConnection(connection: string): Promise<Certificate | null> {
    return prisma.certificate.findUnique({ where: { connection } });
  }

  static async findByKey(key: string): Promise<Certificate | null> {
    return prisma.certificate.findFirst({ where: { key } });
  }

  static async update(
    id: string,
    data: { data?: string; status?: number; metadata?: string }
  ): Promise<void> {
    await prisma.certificate.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    await prisma.certificate.delete({ where: { id } });
  }
}

// ─── Pending Registrations ────────────────────────────────────────────────────

export class PendingRegistrationDAO {
  static async create(
    id: string,
    sessionId: string,
    agentName: string,
    requestedCapabilities: string[] = [],
    enrollment?: { initiatedByUserId: string; targetWorkspaceId: string }
  ): Promise<void> {
    await prisma.pendingRegistration.create({
      data: {
        id,
        sessionId,
        agentName,
        requestedCapabilities,
        initiatedByUserId: enrollment?.initiatedByUserId,
        targetWorkspaceId: enrollment?.targetWorkspaceId,
      },
    });
  }

  static async findById(id: string): Promise<PendingRegistration | null> {
    return prisma.pendingRegistration.findUnique({ where: { id } });
  }

  static async findAll(): Promise<PendingRegistration[]> {
    return prisma.pendingRegistration.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateStatus(
    id: string,
    status: "approved" | "rejected",
    capabilities?: string[]
  ): Promise<boolean> {
    const result = await prisma.pendingRegistration.updateMany({
      where: { id, status: "pending" },
      data: { status, assignedCapabilities: capabilities ?? [] },
    });
    return result.count > 0;
  }

  static async delete(id: string): Promise<void> {
    await prisma.pendingRegistration.deleteMany({ where: { id } });
  }
}
