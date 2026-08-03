import { prisma } from "./client";
import type { Principal } from "@prisma/client";

export class PrincipalDAO {
  static async upsert(principal: {
    did: string;
    name: string;
    kind: string;
    publicKey?: string | null;
    workspaceId?: string | null;
    kindConfig?: unknown;
  }): Promise<Principal> {
    const data = {
      name: principal.name,
      kind: principal.kind,
      publicKey: principal.publicKey ?? undefined,
      workspaceId: principal.workspaceId ?? null,
      kindConfig: (principal.kindConfig ?? {}) as never,
      lastSeen: new Date(),
    };
    return prisma.principal.upsert({
      where: { did: principal.did },
      create: { did: principal.did, ...data },
      update: data,
    });
  }

  static async findByDid(did: string): Promise<Principal | null> {
    return prisma.principal.findUnique({ where: { did } });
  }

  static async touchLastSeen(did: string): Promise<void> {
    await prisma.principal.update({
      where: { did },
      data: { lastSeen: new Date() },
    });
  }

  static async list(filter?: {
    kind?: string;
    workspaceId?: string;
  }): Promise<Principal[]> {
    return prisma.principal.findMany({
      where: {
        kind: filter?.kind,
        workspaceId: filter?.workspaceId,
      },
      orderBy: { registeredAt: "desc" },
    });
  }

  static async count(filter?: { kind?: string }): Promise<number> {
    return prisma.principal.count({ where: { kind: filter?.kind } });
  }

  static async countByKind(): Promise<Record<string, number>> {
    const rows = await prisma.principal.groupBy({ by: ["kind"], _count: { kind: true } });
    return Object.fromEntries(rows.map((r) => [r.kind, r._count.kind]));
  }
}
