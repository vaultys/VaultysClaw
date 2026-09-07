import { prisma } from "./client";
import type { Actor } from "@prisma/client";

export class ActorDAO {
  /**
   * `kindConfig` is only ever touched on `update` if explicitly passed — omitting it must leave
   * whatever's already there alone. Every caller today (registration approval) never passes it,
   * so defaulting it to `{}` unconditionally on update, as this used to, silently wiped out
   * whatever `mergeKindConfig` (e.g. a sensor's `hostname`/`os` from telemetry) had already set,
   * every single time an existing Actor's registration got approved again.
   */
  static async upsert(actor: {
    did: string;
    name: string;
    kind: string;
    publicKey?: string | null;
    workspaceId?: string | null;
    kindConfig?: unknown;
  }): Promise<Actor> {
    const shared = {
      name: actor.name,
      kind: actor.kind,
      publicKey: actor.publicKey ?? undefined,
      workspaceId: actor.workspaceId ?? null,
      lastSeen: new Date(),
    };
    return prisma.actor.upsert({
      where: { did: actor.did },
      create: { did: actor.did, ...shared, kindConfig: (actor.kindConfig ?? {}) as never },
      update: { ...shared, ...(actor.kindConfig !== undefined ? { kindConfig: actor.kindConfig as never } : {}) },
    });
  }

  static async findByDid(did: string): Promise<Actor | null> {
    return prisma.actor.findUnique({ where: { did } });
  }

  /** Batched lookup for correlating a set of claimed DIDs (e.g. SensorWorkload.identityEvidence
   *  values) against real registered Actors — one query, not N+1. */
  static async findManyByDid(dids: string[]): Promise<Actor[]> {
    if (dids.length === 0) return [];
    return prisma.actor.findMany({ where: { did: { in: dids } } });
  }

  /** Admin-editable fields only — `did`/`kind`/`publicKey` are captured at registration and never
   *  change. `ownerDid` records "this actor belongs to / acts for that actor" (lib/actor-kinds.ts's
   *  `device` kind) — descriptive/administrative only, not consulted by resolvePermission. */
  static async update(
    did: string,
    data: { name?: string; workspaceId?: string | null; ownerDid?: string | null }
  ): Promise<Actor> {
    return prisma.actor.update({
      where: { did },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
        ...(data.ownerDid !== undefined ? { ownerDid: data.ownerDid } : {}),
      },
    });
  }

  static async touchLastSeen(did: string): Promise<void> {
    await prisma.actor.update({
      where: { did },
      data: { lastSeen: new Date() },
    });
  }

  /**
   * Stamp `lastSeen` on many Actors in one statement.
   *
   * The heartbeat path used the single-row version, which at fleet scale is pure write
   * amplification: 7,000 Actors on a 30-second heartbeat is ~230 UPDATEs per second, every one of
   * them setting a column nothing authoritative reads. "Online now" comes from the live WebSocket
   * connection map (`isConnected`), not from this timestamp — `lastSeen` is a display value, so a
   * batched, slightly-behind write is the right trade and an exactly-current one was never a
   * property anything depended on.
   *
   * `updateMany` silently skips a DID with no row, which is the behaviour wanted here: an Actor
   * deleted between the heartbeat and the flush should not fail the whole batch.
   */
  static async touchLastSeenBatch(dids: string[]): Promise<number> {
    if (dids.length === 0) return 0;
    const result = await prisma.actor.updateMany({
      where: { did: { in: dids } },
      data: { lastSeen: new Date() },
    });
    return result.count;
  }

  /**
   * Record the capability manifest an Actor reported in `register`
   * (docs/CUSTOM_CAPABILITIES.md).
   *
   * Informational only — it drives the "wanted / registered / granted" diff on the Actor detail
   * page. Nothing reads it to make an authorization decision, so an Actor writing here cannot
   * grant itself anything.
   */
  static async setDeclaredCapabilities(
    did: string,
    declared: { name: string; label?: string; description?: string }[]
  ): Promise<void> {
    await prisma.actor.update({ where: { did }, data: { declaredCapabilities: declared } });
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

  /**
   * Remove an Actor row.
   *
   * **Revoke its certificates before calling this.** The `CapabilityCertificate`
   * relation cascades, so this deletes them — and a deleted certificate is not a
   * revoked one. A packcert verifies offline against the pinned anchor with no
   * reference to any row, and `handleCertStatusRequest` answers a status query
   * for a certificate it cannot find with an *error* rather than a signed
   * "revoked", so a holder learns nothing and keeps running on its last cached
   * status. Deleting first therefore leaves a live grant in the wild that can
   * never be told it is dead; revoking first is what actually ends it, and the
   * deletion is only cleanup. `deleteActorAction` does them in that order.
   *
   * The audit trail survives: `AuditLogEntry.actorDid` is denormalized rather
   * than a relation, precisely so an Actor can be removed without erasing what
   * it did.
   */
  static async delete(did: string): Promise<void> {
    await prisma.actor.delete({ where: { did } });
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
