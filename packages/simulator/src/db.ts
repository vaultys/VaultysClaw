/**
 * Direct database access, for the two things the protocol deliberately gives no client-side route
 * to: approving registrations, and reading fleet-wide state.
 *
 * Reaching past the API is the right call *here* and nowhere else. Approval is an admin act that
 * exists precisely so an Actor cannot grant itself anything — the simulator is standing in for the
 * admin, not for a client, and a simulator that could approve itself over the wire would be
 * evidence of a hole rather than a convenience. Doing it in SQL keeps that boundary honest: this
 * is the only file here that touches the database, and it is not reachable from `fleet.ts`.
 *
 * The Prisma schema is copied from the control plane by `pnpm simulator:prisma`, the same
 * arrangement `packages/webhook-dispatcher` uses.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { jitterAround, locationForDid } from "./locations.js";
import { ownerIndexForDid } from "./ownership.js";
import { PERSONAS, type SimKind } from "./personas.js";
import { HUMAN_CAPABILITIES, SIM_EMAIL_DOMAIN, type SimHuman } from "./people.js";
import { issueStandingGrant, serverIdentity } from "./grants.js";

let client: PrismaClient | null = null;

export function prisma(databaseUrl: string | undefined): PrismaClient {
  if (client) return client;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. The simulator needs it to approve registrations and read fleet " +
        "state — point it at the same database the control plane writes to (see " +
        "packages/controlplane/.env), not merely one with the same schema."
    );
  }
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  return client;
}

export interface ApprovalResult {
  approved: number;
  byKind: Record<string, number>;
}

/**
 * Approve every pending registration whose name looks like a simulated Actor.
 *
 * Scoped by name prefix rather than approving everything pending: a developer's real agent sitting
 * in the same queue must not be silently granted capabilities because a load test ran. The
 * capabilities granted are the ones the Actor requested, intersected with what its kind may hold —
 * the same filter `lib/registrations.ts` applies, reimplemented here rather than imported because
 * importing it would drag Next.js and the whole control-plane module graph into the simulator.
 */
export async function approveSimulatedRegistrations(
  databaseUrl: string | undefined,
  namePrefixes: string[]
): Promise<ApprovalResult> {
  const db = prisma(databaseUrl);
  const pending = await db.pendingRegistration.findMany({ where: { status: "pending" } });

  const mine = pending.filter((p) => namePrefixes.some((prefix) => p.name.startsWith(prefix)));
  const byKind: Record<string, number> = {};

  for (const reg of mine) {
    const requested = (reg.requestedCapabilities as string[]) ?? [];
    const allowed = allowedForKind(reg.kind);
    const granted = requested.filter((c) => allowed.includes(c));

    // Creating the Actor row is the part that is easy to miss and silently breaks everything
    // downstream. `approvePendingRegistration` upserts an Actor *and then* marks the registration
    // approved; flipping only the registration leaves `ActorDAO.findByDid` returning null, so the
    // next connection is treated as a brand-new registrant, files a second PendingRegistration,
    // and no certificate is ever issued. The symptom is a fleet that reconnects forever with a
    // growing pending queue and zero errors.
    // Sensors get a place on the map. A sensor is a machine sitting somewhere physical, so this is
    // the kind where a location means something — an `openclaw` agent is a process, and pinning one
    // to a city would be inventing a fact. Deterministic per DID, so the map looks the same on
    // every run (see `locations.ts`).
    const placement = reg.kind === "sensor" ? placeSensor(reg.did) : null;

    await db.actor.upsert({
      where: { did: reg.did },
      create: {
        did: reg.did,
        name: reg.name,
        kind: reg.kind,
        publicKey: reg.publicKey ?? undefined,
        workspaceId: reg.targetWorkspaceId ?? null,
        lastSeen: new Date(),
        kindConfig: {},
        ...(placement ?? {}),
      },
      update: {
        name: reg.name,
        kind: reg.kind,
        publicKey: reg.publicKey ?? undefined,
        workspaceId: reg.targetWorkspaceId ?? null,
        lastSeen: new Date(),
        // Re-applied on update as well as create: a fleet approved before this existed has Actor
        // rows with no location, and the point is that re-running fills the map in rather than
        // requiring a reset.
        ...(placement ?? {}),
      },
    });

    await db.pendingRegistration.update({
      where: { id: reg.id },
      data: {
        status: "approved",
        assignedCapabilities: granted,
        approvedBy: "simulator",
        // deliveredAt stays null on purpose: delivery happens over a live `service: "certificate"`
        // exchange when the Actor next connects, which is what makes the reconnect mint a real
        // certificate instead of the simulator forging one.
        deliveredAt: null,
      },
    });
    byKind[reg.kind] = (byKind[reg.kind] ?? 0) + 1;
  }

  return { approved: mine.length, byKind };
}

/**
 * The location columns for a sensor, ready to spread into an Actor write.
 *
 * A city from the modelled network plus a few kilometres of deterministic jitter, so sensors in the
 * same city stay individually visible at high zoom instead of stacking into one permanent cluster.
 */
function placeSensor(did: string): { locationLat: number; locationLon: number; locationLabel: string } {
  const city = locationForDid(did);
  const { lat, lon } = jitterAround(city, did);
  return { locationLat: lat, locationLon: lon, locationLabel: city.label };
}

/** The per-kind built-in allow-list, mirroring `controlplane/lib/capabilities.ts`. */
function allowedForKind(kind: string): string[] {
  if (kind === "sensor") return ["process_read"];
  return [
    "file_read",
    "file_write",
    "internet_access",
    "browser_control",
    "api_call",
    "mail_send",
    "code_execution",
    "system_command",
    "agent_communication",
    "knowledge_search",
    "non_delegatable",
  ];
}

/**
 * Write the human population into the ledger: an Actor, a profile, and a `portal_access` grant.
 *
 * Idempotent, and cheap on a rerun: the Actor upsert is the only unconditional write, and a person
 * who already holds an active certificate is not issued a second one. Without that check every run
 * would append another thousand rows to an append-only ledger, and the certificate list would be
 * mostly duplicates of the same standing grant.
 *
 * Writing these directly is the same deliberate back door `simulator admin` uses — `human` is
 * onboarded through login, not through the registration handshake, so there is no client-side route
 * to here. See `grants.ts`.
 */
export async function upsertPeople(
  databaseUrl: string | undefined,
  people: SimHuman[],
  onProgress?: (done: number, total: number) => void
): Promise<{ created: number; granted: number }> {
  if (people.length === 0) return { created: 0, granted: 0 };
  const db = prisma(databaseUrl);
  const serverVid = await serverIdentity(db);

  let created = 0;
  let granted = 0;
  let done = 0;

  await mapLimit(people, 16, async (person) => {
    const existing = await db.actor.findUnique({ where: { did: person.did } });
    if (!existing) created++;

    await db.actor.upsert({
      where: { did: person.did },
      create: {
        did: person.did,
        name: person.name,
        kind: "human",
        // Normally captured from the handshake. Recorded here too, or the certificate detail page
        // cannot independently re-verify anything this identity signs.
        publicKey: person.publicKey,
        kindConfig: {},
        humanProfile: {
          create: { email: person.email, profileCompletedAt: new Date() },
        },
      },
      update: {
        name: person.name,
        publicKey: person.publicKey,
        // Upsert rather than update: a rerun against a database where the Actor row survived but
        // the profile did not would otherwise leave a human with no email — which is also the
        // marker every other operation here scopes on, so it would leak out of `reset`.
        humanProfile: {
          upsert: {
            create: { email: person.email, profileCompletedAt: new Date() },
            update: { email: person.email },
          },
        },
      },
    });

    const holds = await db.capabilityCertificate.count({
      where: { agentDid: person.did, status: "active" },
    });
    if (holds === 0) {
      await issueStandingGrant(db, serverVid, person.did, HUMAN_CAPABILITIES, "simulator:people");
      granted++;
    }

    done++;
    if (onProgress && (done % 50 === 0 || done === people.length)) onProgress(done, people.length);
  });

  return { created, granted };
}

export interface OwnershipResult {
  /** Actors whose `ownerDid` this pass wrote. */
  assigned: number;
  /** Actors that already pointed at the owner this pass would have chosen. */
  unchanged: number;
  /** Actors of a kind that deliberately has no owner (see `Persona.ownedByHuman`). */
  ownerless: number;
  /** How many of the people actually ended up owning something. */
  owners: number;
  /** The largest number of Actors any one person owns — the tail of the skew, worth seeing. */
  busiest: number;
}

/**
 * Point every simulated Actor at the person it belongs to.
 *
 * Deliberately a **separate pass** rather than a field set during approval, for two reasons:
 *
 * 1. Approval only ever walks the *pending* queue, so a fleet approved by an earlier run — the
 *    normal case on the second and every subsequent run — would never get an owner. `locations.ts`
 *    hit this and worked around it by re-applying on update; a pass over everything is the version
 *    that actually covers a fleet approved before the feature existed.
 * 2. It keeps ownership recomputable. The mapping is a pure function of the DID
 *    (`ownership.ts`), so running this again is a no-op — which is what makes it safe to call on
 *    every run.
 *
 * This is authoritative for simulated Actors: an owner reassigned by hand in the console is put
 * back on the next run. That is the right trade for a demo fixture, and the wrong one for anything
 * else — which is why it is scoped by name prefix like every other write in this file.
 */
export async function assignOwnership(
  databaseUrl: string | undefined,
  namePrefixes: string[],
  people: SimHuman[]
): Promise<OwnershipResult> {
  const empty = {
    assigned: 0,
    unchanged: 0,
    ownerless: 0,
    owners: 0,
    busiest: 0,
  };
  if (people.length === 0) return empty;

  const db = prisma(databaseUrl);
  const actors = await db.actor.findMany({
    where: {
      OR: namePrefixes.map((prefix) => ({ name: { startsWith: prefix } })),
    },
    select: { did: true, kind: true, ownerDid: true },
  });

  // Grouped by target owner so this is one `updateMany` per person rather than one per Actor —
  // 7,000 round trips would take longer than the ramp they are supposed to decorate.
  const changesByOwner = new Map<string, string[]>();
  /** Every Actor each person ends up owning, changed or not — this is what `busiest` reads. */
  const tallyByOwner = new Map<string, number>();
  const result = { ...empty };

  for (const actor of actors) {
    if (!PERSONAS[actor.kind as SimKind]?.ownedByHuman) {
      result.ownerless++;
      continue;
    }
    const ownerDid = people[ownerIndexForDid(actor.did, people.length)].did;
    tallyByOwner.set(ownerDid, (tallyByOwner.get(ownerDid) ?? 0) + 1);

    if (actor.ownerDid === ownerDid) {
      result.unchanged++;
      continue;
    }
    result.assigned++;
    const pendingForOwner = changesByOwner.get(ownerDid);
    if (pendingForOwner) pendingForOwner.push(actor.did);
    else changesByOwner.set(ownerDid, [actor.did]);
  }

  await mapLimit([...changesByOwner.entries()], 16, async ([ownerDid, dids]) => {
    // Chunked: `IN (…)` with 7,000 parameters is a query Postgres will accept and nothing will
    // enjoy. One person never owns anywhere near that many, but the ceiling should not depend on
    // the skew staying mild.
    for (const batch of chunk(dids, 500)) {
      await db.actor.updateMany({
        where: { did: { in: batch } },
        data: { ownerDid },
      });
    }
  });

  result.owners = tallyByOwner.size;
  result.busiest = Math.max(0, ...tallyByOwner.values());
  return result;
}

/** Run `fn` over `items` with at most `limit` in flight — the pool has 60 connections, and 7,000
 *  concurrent queries would spend all of them queuing. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface FleetStats {
  actors: number;
  actorsByKind: Record<string, number>;
  pending: number;
  approvedUndelivered: number;
  activeCerts: number;
  revokedCerts: number;
  statusChecks: number;
  customCapabilities: number;
  /** Simulated humans, identified by their reserved email domain (see `people.ts`). */
  people: number;
  /** Actors pointing at an owner — the ownership edges `/admin/graph` has to draw. */
  owned: number;
  /** Distinct people actually owning something. Less than `people` when the skew leaves a tail. */
  owners: number;
}

export async function readStats(databaseUrl: string | undefined): Promise<FleetStats> {
  const db = prisma(databaseUrl);
  const [
    actors,
    pending,
    approvedUndelivered,
    activeCerts,
    revokedCerts,
    statusChecks,
    custom,
    people,
    owned,
  ] = await Promise.all([
    db.actor.groupBy({ by: ["kind"], _count: { _all: true } }),
    db.pendingRegistration.count({ where: { status: "pending" } }),
    db.pendingRegistration.count({
      where: { status: "approved", deliveredAt: null },
    }),
    db.capabilityCertificate.count({ where: { status: "active" } }),
    db.capabilityCertificate.count({ where: { status: "revoked" } }),
    db.certStatusCheck.count(),
    db.customCapability.count(),
    db.actor.count({ where: SIMULATED_PEOPLE }),
    db.actor.groupBy({
      by: ["ownerDid"],
      where: { ownerDid: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const actorsByKind: Record<string, number> = {};
  for (const row of actors) actorsByKind[row.kind] = row._count._all;

  return {
    actors: actors.reduce((n, r) => n + r._count._all, 0),
    actorsByKind,
    pending,
    approvedUndelivered,
    activeCerts,
    revokedCerts,
    statusChecks,
    customCapabilities: custom,
    people,
    owned: owned.reduce((n, row) => n + row._count._all, 0),
    owners: owned.length,
  };
}

/**
 * Remove simulated Actors and everything hanging off them.
 *
 * Name-scoped for the same reason approval is. Certificates and status checks cascade from `Actor`
 * (see the schema's `onDelete: Cascade`), so deleting the Actor rows is sufficient — but pending
 * registrations have no FK to cascade through and are cleared explicitly.
 */
export async function resetSimulated(
  databaseUrl: string | undefined,
  namePrefixes: string[]
): Promise<{ actors: number; people: number; registrations: number }> {
  const db = prisma(databaseUrl);
  const or = namePrefixes.map((prefix) => ({ name: { startsWith: prefix } }));

  const actors = await db.actor.deleteMany({ where: { OR: or } });
  // The people go too, scoped by the reserved email domain rather than by name — they are named
  // after actual people, so there is no prefix to match on, and a domain that cannot exist is a
  // stricter filter than a prefix anyway. `User` cascades from `Actor`; the agents' `ownerDid`
  // is `onDelete: SetNull`, so removing the population unlinks the fleet rather than deleting it.
  //
  // The `simulator admin` human survives this: it is minted with no email, or with a real one.
  const people = await db.actor.deleteMany({ where: SIMULATED_PEOPLE });
  const registrations = await db.pendingRegistration.deleteMany({
    where: { OR: or },
  });
  return {
    actors: actors.count,
    people: people.count,
    registrations: registrations.count,
  };
}

/** Every Actor this simulator created as a person. See `people.ts` on why the email is the marker. */
const SIMULATED_PEOPLE = {
  kind: "human",
  humanProfile: { is: { email: { endsWith: `@${SIM_EMAIL_DOMAIN}` } } },
} as const;

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = null;
}
