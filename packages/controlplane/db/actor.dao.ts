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

  /** `null` clears the location entirely (all three columns), matching the map/detail page's
   *  "Clear" action — there's no such thing as a lat/lon with no label or vice versa. */
  static async updateLocation(
    did: string,
    location: { lat: number; lon: number; label: string } | null
  ): Promise<void> {
    await prisma.actor.update({
      where: { did },
      data: {
        locationLat: location?.lat ?? null,
        locationLon: location?.lon ?? null,
        locationLabel: location?.label ?? null,
      },
    });
  }

  /** Merges into the existing `kindConfig` JSON rather than replacing it — kind-specific fields
   *  (e.g. a sensor's `hostname`/`os`, set from telemetry) shouldn't clobber unrelated ones. */
  static async mergeKindConfig(did: string, patch: Record<string, unknown>): Promise<void> {
    const actor = await prisma.actor.findUnique({ where: { did }, select: { kindConfig: true } });
    const current = (actor?.kindConfig ?? {}) as Record<string, unknown>;
    await prisma.actor.update({
      where: { did },
      data: { kindConfig: { ...current, ...patch } as never },
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

  /** Every Actor with a location set — the map page's marker source. */
  static async listLocated(): Promise<Actor[]> {
    return prisma.actor.findMany({
      where: { locationLat: { not: null }, locationLon: { not: null } },
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
