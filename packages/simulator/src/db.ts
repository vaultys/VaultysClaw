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
      },
      update: {
        name: reg.name,
        kind: reg.kind,
        publicKey: reg.publicKey ?? undefined,
        workspaceId: reg.targetWorkspaceId ?? null,
        lastSeen: new Date(),
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

export interface FleetStats {
  actors: number;
  actorsByKind: Record<string, number>;
  pending: number;
  approvedUndelivered: number;
  activeCerts: number;
  revokedCerts: number;
  statusChecks: number;
  customCapabilities: number;
}

export async function readStats(databaseUrl: string | undefined): Promise<FleetStats> {
  const db = prisma(databaseUrl);
  const [actors, pending, approvedUndelivered, activeCerts, revokedCerts, statusChecks, custom] =
    await Promise.all([
      db.actor.groupBy({ by: ["kind"], _count: { _all: true } }),
      db.pendingRegistration.count({ where: { status: "pending" } }),
      db.pendingRegistration.count({ where: { status: "approved", deliveredAt: null } }),
      db.capabilityCertificate.count({ where: { status: "active" } }),
      db.capabilityCertificate.count({ where: { status: "revoked" } }),
      db.certStatusCheck.count(),
      db.customCapability.count(),
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
): Promise<{ actors: number; registrations: number }> {
  const db = prisma(databaseUrl);
  const or = namePrefixes.map((prefix) => ({ name: { startsWith: prefix } }));

  const actors = await db.actor.deleteMany({ where: { OR: or } });
  const registrations = await db.pendingRegistration.deleteMany({ where: { OR: or } });
  return { actors: actors.count, registrations: registrations.count };
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = null;
}
