import { prisma } from "./client";
import type { Actor } from "@prisma/client";

export class ActorDAO {
  static async upsert(actor: {
    did: string;
    name: string;
    kind: string;
    publicKey?: string | null;
    workspaceId?: string | null;
    kindConfig?: unknown;
  }): Promise<Actor> {
    const data = {
      name: actor.name,
      kind: actor.kind,
      publicKey: actor.publicKey ?? undefined,
      workspaceId: actor.workspaceId ?? null,
      kindConfig: (actor.kindConfig ?? {}) as never,
      lastSeen: new Date(),
    };
    return prisma.actor.upsert({
      where: { did: actor.did },
      create: { did: actor.did, ...data },
      update: data,
    });
  }

  static async findByDid(did: string): Promise<Actor | null> {
    return prisma.actor.findUnique({ where: { did } });
  }

  /** Admin-editable fields only — `did`/`kind`/`publicKey` are captured at registration and never change. */
  static async update(
    did: string,
    data: { name?: string; workspaceId?: string | null }
  ): Promise<Actor> {
    return prisma.actor.update({
      where: { did },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
      },
    });
  }

  static async touchLastSeen(did: string): Promise<void> {
    await prisma.actor.update({
      where: { did },
      data: { lastSeen: new Date() },
    });
  }

  static async list(filter?: {
    kind?: string;
    workspaceId?: string;
  }): Promise<Actor[]> {
    return prisma.actor.findMany({
      where: {
        kind: filter?.kind,
        workspaceId: filter?.workspaceId,
      },
      orderBy: { registeredAt: "desc" },
    });
  }

  static async count(filter?: { kind?: string }): Promise<number> {
    return prisma.actor.count({ where: { kind: filter?.kind } });
  }

  static async countByKind(): Promise<Record<string, number>> {
    const rows = await prisma.actor.groupBy({ by: ["kind"], _count: { kind: true } });
    return Object.fromEntries(rows.map((r) => [r.kind, r._count.kind]));
  }
}
