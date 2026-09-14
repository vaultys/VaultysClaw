import { randomUUID } from "crypto";
import { prisma } from "./client";
import type { ActorLink, Actor } from "@prisma/client";

export type ActorLinkWithActors = ActorLink & { from: Actor; to: Actor };

/** A directed, freely-labeled edge between two Actors ("reports to", "belongs to", "manages", ...) —
 *  generic on purpose, so any kind of Actor can link to any other without a schema-level relation type. */
export class ActorLinkDAO {
  static async create(input: { fromDid: string; toDid: string; label: string }): Promise<ActorLink> {
    return prisma.actorLink.create({
      data: { id: randomUUID(), fromDid: input.fromDid, toDid: input.toDid, label: input.label },
    });
  }

  static async delete(id: string): Promise<void> {
    await prisma.actorLink.deleteMany({ where: { id } });
  }

  /** Both directions — links this Actor made (`from`) and links others made pointing at it (`to`). */
  static async listForActor(did: string): Promise<{ from: ActorLinkWithActors[]; to: ActorLinkWithActors[] }> {
    const [from, to] = await Promise.all([
      prisma.actorLink.findMany({
        where: { fromDid: did },
        include: { from: true, to: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.actorLink.findMany({
        where: { toDid: did },
        include: { from: true, to: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { from, to };
  }

  /** Every link touching any of these Actors, in one query — the batched counterpart of
   *  `listForActor`, so walking a neighbourhood costs a query per hop rather than per actor. */
  static async listForActors(dids: string[]): Promise<ActorLinkWithActors[]> {
    if (dids.length === 0) return [];
    return prisma.actorLink.findMany({
      where: { OR: [{ fromDid: { in: dids } }, { toDid: { in: dids } }] },
      include: { from: true, to: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async list(): Promise<ActorLinkWithActors[]> {
    return prisma.actorLink.findMany({
      include: { from: true, to: true },
      orderBy: { createdAt: "desc" },
    });
  }
}
