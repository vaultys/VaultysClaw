import { prisma } from "./client";
import { Prisma } from "@prisma/client";
import type { SensorWorkload } from "@prisma/client";
import type { SensorTelemetryEvent } from "@vaultysclaw/shared";

export class SensorWorkloadDAO {
  /**
   * Applies one telemetry event to workload state, upserting by
   * (deviceDid, fingerprint) — current state, not an append-only log. An
   * ai_workload_stopped event removes the row, mirroring
   * vaultysclaw-sensor's own reference collector (internal/ingest/store.go).
   */
  static async upsert(
    deviceDid: string,
    event: SensorTelemetryEvent
  ): Promise<void> {
    if (event.type === "ai_workload_stopped") {
      await prisma.sensorWorkload.deleteMany({
        where: { deviceDid, fingerprint: event.workload.fingerprint },
      });
      return;
    }

    const w = event.workload;
    const data: Prisma.SensorWorkloadUncheckedUpdateInput = {
      processName: w.process.name,
      executable: w.process.executable ?? null,
      command: w.process.command ?? null,
      osUser: w.process.user ?? null,
      provider: w.provider ?? null,
      model: w.model ?? null,
      aiConfidence: w.aiConfidence,
      agentConfidence: w.agentConfidence,
      reasons: (w.reasons ?? []) as Prisma.InputJsonValue,
      isMcp: w.isMcp ?? false,
      mcpServers: w.mcpServers ? (w.mcpServers as Prisma.InputJsonValue) : Prisma.JsonNull,
      isLocalRuntime: w.isLocalRuntime ?? false,
      lastEventType: event.type,
      lastSeen: new Date(event.timestamp),
    };

    await prisma.sensorWorkload.upsert({
      where: {
        deviceDid_fingerprint: { deviceDid, fingerprint: w.fingerprint },
      },
      create: {
        deviceDid,
        fingerprint: w.fingerprint,
        ...data,
      } as Prisma.SensorWorkloadUncheckedCreateInput,
      update: data,
    });
  }

  static async listByDevice(deviceDid: string): Promise<SensorWorkload[]> {
    return prisma.sensorWorkload.findMany({
      where: { deviceDid },
      orderBy: { lastSeen: "desc" },
    });
  }
}
