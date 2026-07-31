import { prisma } from "./client";
import { Prisma } from "@prisma/client";
import type { SensorDevice } from "@prisma/client";

/** Agent confidence at/above this threshold surfaces a workload as "shadow" —
 * matches vaultysclaw-sensor's own reference-collector threshold
 * (internal/ingest/store.go). */
export const SHADOW_THRESHOLD = 0.75;

const deviceInclude = {
  assignedUser: { select: { id: true, name: true, email: true } },
  workspace: { select: { id: true, name: true, slug: true, color: true } },
  _count: { select: { workloads: true } },
} as const;

export type SensorDeviceWithCounts = Prisma.SensorDeviceGetPayload<{
  include: typeof deviceInclude;
}>;

export class SensorDeviceDAO {
  static async upsert(device: {
    did: string;
    name?: string;
    hostname?: string;
    os?: string;
  }): Promise<SensorDevice> {
    const data = {
      name: device.name,
      hostname: device.hostname,
      os: device.os,
      lastSeen: new Date(),
    };
    return prisma.sensorDevice.upsert({
      where: { did: device.did },
      create: { did: device.did, ...data },
      update: data,
    });
  }

  static async findByDid(did: string): Promise<SensorDeviceWithCounts | null> {
    return prisma.sensorDevice.findUnique({
      where: { did },
      include: deviceInclude,
    });
  }

  static async updateLastSeen(
    did: string,
    info?: { hostname?: string; os?: string }
  ): Promise<void> {
    await prisma.sensorDevice.update({
      where: { did },
      data: {
        lastSeen: new Date(),
        ...(info?.hostname ? { hostname: info.hostname } : {}),
        ...(info?.os ? { os: info.os } : {}),
      },
    });
  }

  static async assignUser(
    did: string,
    userId: string | null
  ): Promise<SensorDevice> {
    return prisma.sensorDevice.update({
      where: { did },
      data: { assignedUserId: userId },
    });
  }

  static async assignWorkspace(
    did: string,
    workspaceId: string | null
  ): Promise<SensorDevice> {
    return prisma.sensorDevice.update({
      where: { did },
      data: { workspaceId },
    });
  }

  static async query(opts: {
    search?: string;
    assignedUserId?: string; // "unassigned" for devices with no assignment
    workspaceId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    devices: SensorDeviceWithCounts[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const {
      search,
      assignedUserId,
      workspaceId,
      page = 1,
      pageSize = 20,
    } = opts;

    const where: Prisma.SensorDeviceWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { hostname: { contains: search, mode: "insensitive" } },
        { did: { contains: search, mode: "insensitive" } },
      ];
    }
    if (assignedUserId === "unassigned") {
      where.assignedUserId = null;
    } else if (assignedUserId) {
      where.assignedUserId = assignedUserId;
    }
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const [total, devices] = await Promise.all([
      prisma.sensorDevice.count({ where }),
      prisma.sensorDevice.findMany({
        where,
        orderBy: { lastSeen: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: deviceInclude,
      }),
    ]);

    return {
      devices,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  static async delete(did: string): Promise<void> {
    await prisma.sensorDevice.delete({ where: { did } });
  }

  /** Fleet-wide stats for the /admin/sensors summary cards. */
  static async stats(): Promise<{
    totalSensors: number;
    unassignedSensors: number;
    totalWorkloads: number;
    managedWorkloads: number;
    shadowWorkloads: number;
    byProvider: Array<{ provider: string; count: number }>;
  }> {
    // "managed" = identityEvidence correlates to a registered Agent — the
    // sensor never self-reports this, so it's computed via a join here
    // rather than persisted (see docs/vaultysclaw-integration.md §4).
    // "shadow" is agentConfidence >= threshold among the rest.
    const [
      totalSensors,
      unassignedSensors,
      totalWorkloads,
      statusCountsRaw,
      byProviderRaw,
    ] = await Promise.all([
      prisma.sensorDevice.count(),
      prisma.sensorDevice.count({ where: { assignedUserId: null } }),
      prisma.sensorWorkload.count(),
      prisma.$queryRaw<[{ managed: bigint; shadow: bigint }]>`
        SELECT
          COUNT(*) FILTER (WHERE a.did IS NOT NULL)::bigint AS managed,
          COUNT(*) FILTER (WHERE a.did IS NULL AND sw."agentConfidence" >= ${SHADOW_THRESHOLD})::bigint AS shadow
        FROM "SensorWorkload" sw
        LEFT JOIN "Agent" a ON a.did = sw."identityEvidence"
      `,
      prisma.sensorWorkload.groupBy({
        by: ["provider"],
        _count: { _all: true },
        where: { provider: { not: null } },
      }),
    ]);

    return {
      totalSensors,
      unassignedSensors,
      totalWorkloads,
      managedWorkloads: Number(statusCountsRaw[0]?.managed ?? 0),
      shadowWorkloads: Number(statusCountsRaw[0]?.shadow ?? 0),
      byProvider: byProviderRaw
        .map((r: { provider: string | null; _count: { _all: number } }) => ({
          provider: r.provider ?? "unknown",
          count: r._count._all,
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count),
    };
  }
}
