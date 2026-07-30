import { prisma } from "./client";
import { Prisma } from "@prisma/client";
import type { SensorWorkload } from "@prisma/client";
import type { SensorTelemetryEvent } from "@vaultysclaw/shared";
import { AgentDAO } from "./agent.dao";
import { SHADOW_THRESHOLD } from "./sensor-device.dao";

export type SensorWorkloadStatus = "managed" | "observed" | "shadow";

export type SensorWorkloadWithStatus = SensorWorkload & {
  status: SensorWorkloadStatus;
};

/**
 * Server-side status derivation (see vaultysclaw-sensor/docs/vaultysclaw-integration.md
 * §4): the sensor only ever reports raw evidence — the control plane decides
 * "managed" by correlating `identityEvidence` against the real Agent registry.
 * `knownAgentDids` must contain every Agent DID present among the workloads'
 * `identityEvidence` values (see {@link AgentDAO.filterKnownDids}).
 */
function computeStatus(
  workload: Pick<SensorWorkload, "identityEvidence" | "agentConfidence">,
  knownAgentDids: ReadonlySet<string>
): SensorWorkloadStatus {
  if (workload.identityEvidence && knownAgentDids.has(workload.identityEvidence)) {
    return "managed";
  }
  return workload.agentConfidence >= SHADOW_THRESHOLD ? "shadow" : "observed";
}

async function withStatus(
  workloads: SensorWorkload[]
): Promise<SensorWorkloadWithStatus[]> {
  const evidenceDids = [
    ...new Set(
      workloads
        .map((w) => w.identityEvidence)
        .filter((did): did is string => !!did)
    ),
  ];
  const knownAgentDids = await AgentDAO.filterKnownDids(evidenceDids);
  return workloads.map((w) => ({ ...w, status: computeStatus(w, knownAgentDids) }));
}

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
      identityEvidence: w.identityEvidence ?? null,
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

  /** Same as {@link listByDevice}, with each workload's derived managed/observed/shadow status. */
  static async listByDeviceWithStatus(
    deviceDid: string
  ): Promise<SensorWorkloadWithStatus[]> {
    return withStatus(await this.listByDevice(deviceDid));
  }
}
