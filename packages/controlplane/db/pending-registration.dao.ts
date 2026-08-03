import { prisma } from "./client";
import type { PendingRegistration } from "@prisma/client";

export class PendingRegistrationDAO {
  static async create(input: {
    id: string;
    did: string;
    sessionId: string;
    name: string;
    kind: string;
    requestedCapabilities: string[];
  }): Promise<PendingRegistration> {
    return prisma.pendingRegistration.create({
      data: {
        id: input.id,
        did: input.did,
        sessionId: input.sessionId,
        name: input.name,
        kind: input.kind,
        requestedCapabilities: input.requestedCapabilities as never,
      },
    });
  }

  static async findById(id: string): Promise<PendingRegistration | null> {
    return prisma.pendingRegistration.findUnique({ where: { id } });
  }

  static async findPendingByDid(did: string): Promise<PendingRegistration | null> {
    return prisma.pendingRegistration.findFirst({ where: { did, status: "pending" } });
  }

  static async listPending(): Promise<PendingRegistration[]> {
    return prisma.pendingRegistration.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });
  }

  static async approve(
    id: string,
    assignedCapabilities: string[],
    targetWorkspaceId?: string | null
  ): Promise<PendingRegistration> {
    return prisma.pendingRegistration.update({
      where: { id },
      data: {
        status: "approved",
        assignedCapabilities: assignedCapabilities as never,
        targetWorkspaceId: targetWorkspaceId ?? null,
      },
    });
  }

  static async deny(id: string): Promise<PendingRegistration> {
    return prisma.pendingRegistration.update({
      where: { id },
      data: { status: "denied" },
    });
  }
}
