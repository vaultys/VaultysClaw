import { randomUUID } from "crypto";
import { prisma } from "./client";
import type { SensorWorkload } from "@prisma/client";

/** A single classified AI/agent process observation reported by a `kind: "sensor"` Actor
 *  (vaultysclaw-sensor/docs/vaultysclaw-integration.md). Mirrors that repo's `telemetry.Workload`. */
export interface SensorWorkloadInput {
  fingerprint: string;
  eventType: string;
  process: {
    name: string;
    executable?: string;
    command?: string;
    user?: string;
  };
  provider?: string;
  model?: string;
  aiConfidence: number;
  agentConfidence: number;
  reasons: string[];
  isMcp: boolean;
  mcpServers: string[];
  isLocalRuntime: boolean;
  identityEvidence?: string;
}

export class SensorWorkloadDAO {
  /** Current-state upsert, not an append — a sensor reports deltas for the same
   *  (deviceDid, fingerprint) pair repeatedly, not a new row per event. */
  static async upsert(deviceDid: string, input: SensorWorkloadInput): Promise<void> {
    const data = {
      processName: input.process.name,
      processExecutable: input.process.executable ?? null,
      processCommand: input.process.command ?? null,
      processUser: input.process.user ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      aiConfidence: input.aiConfidence,
      agentConfidence: input.agentConfidence,
      reasons: input.reasons,
      isMcp: input.isMcp,
      mcpServers: input.mcpServers,
      isLocalRuntime: input.isLocalRuntime,
      identityEvidence: input.identityEvidence ?? null,
      lastEventType: input.eventType,
      lastSeen: new Date(),
    };
    await prisma.sensorWorkload.upsert({
      where: { deviceDid_fingerprint: { deviceDid, fingerprint: input.fingerprint } },
      create: { id: randomUUID(), deviceDid, fingerprint: input.fingerprint, ...data },
      update: data,
    });
  }

  static async listForDevice(deviceDid: string): Promise<SensorWorkload[]> {
    return prisma.sensorWorkload.findMany({
      where: { deviceDid },
      orderBy: { lastSeen: "desc" },
    });
  }

  static async list(): Promise<SensorWorkload[]> {
    return prisma.sensorWorkload.findMany({ orderBy: { lastSeen: "desc" } });
  }
}
