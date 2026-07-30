import { z } from "zod";
import type { SensorDeviceWithCounts } from "@/db";
import type { SensorWorkload } from "@prisma/client";
import { ListSensorsQuerySchema } from "./sensors.schemas";

/** A sensor device row as returned by the list/detail endpoints — the DAO's
 * Prisma payload plus a live "online" flag from the connected-sensors map
 * (not persisted; mirrors how AgentInfo composes `online` at the route layer).
 * DateTime fields stay Prisma's `Date` type here (not re-typed as string) —
 * same convention AgentInfo uses; render with `timeAgo`/`formatDateTime`
 * from `@vaultysclaw/shared`, which accept `Date | string` permissively. */
export type SensorDeviceInfo = SensorDeviceWithCounts & {
  online: boolean;
};

export type SensorDeviceDetail = SensorDeviceInfo & {
  workloads: SensorWorkload[];
};

export interface SensorStats {
  totalSensors: number;
  onlineSensors: number;
  unassignedSensors: number;
  totalWorkloads: number;
  shadowWorkloads: number;
  byProvider: Array<{ provider: string; count: number }>;
}

export type ListSensorsQuery = z.infer<typeof ListSensorsQuerySchema>;
