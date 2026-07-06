import { prisma } from "./client";
import type { Credential, Prisma } from "@prisma/client";

export class CredentialDAO {
  static async save(
    workspaceId: string,
    service: string,
    name: string,
    secretEnc: string,
    metadata?: Record<string, unknown>,
    createdBy?: string
  ): Promise<string> {
    const id = `cred-${crypto.randomUUID()}`;
    const result = await prisma.credential.upsert({
      where: { workspaceId_service_name: { workspaceId, service, name } },
      create: {
        id,
        workspaceId,
        service,
        name,
        secretEnc,
        metadata: (metadata as Prisma.InputJsonValue) ?? {},
        createdBy: createdBy ?? null,
      },
      update: {
        secretEnc,
        metadata: (metadata as Prisma.InputJsonValue) ?? {},
        updatedAt: new Date(),
      },
    });
    return result.id;
  }

  static async findById(id: string): Promise<Credential | null> {
    return prisma.credential.findUnique({ where: { id } });
  }

  static async findByKey(
    workspaceId: string,
    service: string,
    name: string
  ): Promise<Credential | null> {
    return prisma.credential.findUnique({
      where: { workspaceId_service_name: { workspaceId, service, name } },
    });
  }

  static async list(
    workspaceId: string
  ): Promise<Array<Omit<Credential, "secretEnc">>> {
    return prisma.credential.findMany({
      where: { workspaceId },
      orderBy: [{ service: "asc" }, { name: "asc" }],
      select: {
        id: true,
        workspaceId: true,
        service: true,
        name: true,
        metadata: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }) as any;
  }

  static async listByService(
    workspaceId: string,
    service: string
  ): Promise<Array<Omit<Credential, "secretEnc">>> {
    return prisma.credential.findMany({
      where: { workspaceId, service },
      orderBy: { name: "asc" },
      select: {
        id: true,
        workspaceId: true,
        service: true,
        name: true,
        metadata: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }) as any;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.credential.deleteMany({ where: { id } });
    return result.count > 0;
  }

  static async deleteByKey(
    workspaceId: string,
    service: string,
    name: string
  ): Promise<boolean> {
    const result = await prisma.credential.deleteMany({
      where: { workspaceId, service, name },
    });
    return result.count > 0;
  }
}
