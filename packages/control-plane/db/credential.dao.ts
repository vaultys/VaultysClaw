import { prisma } from "./client";
import type { Credential, Prisma } from "@prisma/client";

export class CredentialDAO {
  static async save(
    realmId: string,
    service: string,
    name: string,
    secretEnc: string,
    metadata?: Record<string, unknown>,
    createdBy?: string
  ): Promise<string> {
    const id = `cred-${crypto.randomUUID()}`;
    const result = await prisma.credential.upsert({
      where: { realmId_service_name: { realmId, service, name } },
      create: {
        id,
        realmId,
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
    realmId: string,
    service: string,
    name: string
  ): Promise<Credential | null> {
    return prisma.credential.findUnique({
      where: { realmId_service_name: { realmId, service, name } },
    });
  }

  static async list(
    realmId: string
  ): Promise<Array<Omit<Credential, "secretEnc">>> {
    return prisma.credential.findMany({
      where: { realmId },
      orderBy: [{ service: "asc" }, { name: "asc" }],
      select: {
        id: true,
        realmId: true,
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
    realmId: string,
    service: string
  ): Promise<Array<Omit<Credential, "secretEnc">>> {
    return prisma.credential.findMany({
      where: { realmId, service },
      orderBy: { name: "asc" },
      select: {
        id: true,
        realmId: true,
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
    realmId: string,
    service: string,
    name: string
  ): Promise<boolean> {
    const result = await prisma.credential.deleteMany({
      where: { realmId, service, name },
    });
    return result.count > 0;
  }
}
