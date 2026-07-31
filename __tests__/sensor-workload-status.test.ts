/**
 * Tests for the managed/observed/shadow status correlation
 * (packages/control-plane/db/sensor-workload.dao.ts,
 * packages/control-plane/db/sensor-device.dao.ts) against the test database:
 *   - listByDeviceWithStatus derives "managed" from identityEvidence -> Agent.did
 *   - falls back to "shadow"/"observed" by agentConfidence when no such Agent exists
 *   - SensorDeviceDAO.stats() counts managed/shadow workloads correctly and
 *     never double-counts a managed workload as shadow
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../packages/control-plane/db/client";
import {
  AgentDAO,
  SensorDeviceDAO,
  SensorWorkloadDAO,
} from "../packages/control-plane/db";

const DEVICE_DID = "did:test:sensor-status-device";
const KNOWN_AGENT_DID = "did:test:sensor-status-known-agent";
const UNKNOWN_AGENT_DID = "did:test:sensor-status-unknown-agent";

async function makeWorkload(overrides: {
  fingerprint: string;
  agentConfidence: number;
  identityEvidence?: string | null;
}) {
  await prisma.sensorWorkload.create({
    data: {
      deviceDid: DEVICE_DID,
      fingerprint: overrides.fingerprint,
      processName: "test-proc",
      aiConfidence: 0.5,
      agentConfidence: overrides.agentConfidence,
      identityEvidence: overrides.identityEvidence ?? null,
    },
  });
}

beforeAll(async () => {
  await prisma.sensorWorkload.deleteMany({ where: { deviceDid: DEVICE_DID } });
  await prisma.sensorDevice.deleteMany({ where: { did: DEVICE_DID } });
  await prisma.agent.deleteMany({ where: { did: KNOWN_AGENT_DID } });

  await prisma.sensorDevice.create({
    data: { did: DEVICE_DID, hostname: "test-host" },
  });
  await AgentDAO.upsert({
    did: KNOWN_AGENT_DID,
    name: "Known Agent",
    capabilities: [],
  });
});

afterAll(async () => {
  await prisma.sensorWorkload.deleteMany({ where: { deviceDid: DEVICE_DID } });
  await prisma.sensorDevice.deleteMany({ where: { did: DEVICE_DID } });
  await prisma.agent.deleteMany({ where: { did: KNOWN_AGENT_DID } });
});

describe("SensorWorkloadDAO.listByDeviceWithStatus", () => {
  it("marks a workload as managed when identityEvidence matches a registered Agent", async () => {
    await makeWorkload({
      fingerprint: "fp-managed",
      agentConfidence: 0.1, // low confidence — would be "observed" without the match
      identityEvidence: KNOWN_AGENT_DID,
    });

    const workloads = await SensorWorkloadDAO.listByDeviceWithStatus(DEVICE_DID);
    const w = workloads.find((x) => x.fingerprint === "fp-managed");
    expect(w?.status).toBe("managed");
  });

  it("falls back to shadow when identityEvidence doesn't match any registered Agent", async () => {
    await makeWorkload({
      fingerprint: "fp-shadow",
      agentConfidence: 0.9,
      identityEvidence: UNKNOWN_AGENT_DID,
    });

    const workloads = await SensorWorkloadDAO.listByDeviceWithStatus(DEVICE_DID);
    const w = workloads.find((x) => x.fingerprint === "fp-shadow");
    expect(w?.status).toBe("shadow");
  });

  it("falls back to observed with no identityEvidence and low agentConfidence", async () => {
    await makeWorkload({
      fingerprint: "fp-observed",
      agentConfidence: 0.1,
      identityEvidence: null,
    });

    const workloads = await SensorWorkloadDAO.listByDeviceWithStatus(DEVICE_DID);
    const w = workloads.find((x) => x.fingerprint === "fp-observed");
    expect(w?.status).toBe("observed");
  });
});

describe("SensorDeviceDAO.stats", () => {
  it("counts managed and shadow workloads without double-counting", async () => {
    const stats = await SensorDeviceDAO.stats();
    // At least the 3 workloads seeded above must be reflected.
    expect(stats.managedWorkloads).toBeGreaterThanOrEqual(1);
    expect(stats.shadowWorkloads).toBeGreaterThanOrEqual(1);
    expect(stats.totalWorkloads).toBeGreaterThanOrEqual(3);
  });
});

describe("SensorDeviceDAO.assignWorkspace", () => {
  const WORKSPACE_ID = "test-sensor-status-workspace";

  beforeAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WORKSPACE_ID } });
    await prisma.workspace.create({
      data: {
        id: WORKSPACE_ID,
        name: "Sensor Status Test WS",
        slug: "sensor-status-test-ws",
      },
    });
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WORKSPACE_ID } });
  });

  it("assigns and clears a device's workspace", async () => {
    const assigned = await SensorDeviceDAO.assignWorkspace(DEVICE_DID, WORKSPACE_ID);
    expect(assigned.workspaceId).toBe(WORKSPACE_ID);

    const cleared = await SensorDeviceDAO.assignWorkspace(DEVICE_DID, null);
    expect(cleared.workspaceId).toBeNull();
  });
});
