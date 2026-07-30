import { SensorDeviceDAO, SensorWorkloadDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import type { SensorDeviceDetail, SensorDeviceInfo } from "@/lib/contracts";
import { APIException } from "@/lib/api/utils/api-utils";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { getWSServer } from "@/lib/ws-server";

function isOnline(did: string): boolean {
  return getWSServer()?.listConnectedSensorDids().includes(did) ?? false;
}

const handlers = createNextRoute(adminContract.sensors, {
  // ── GET /api/admin/sensors/:did — device detail + its workloads ─────────────
  getSensor: async ({ params }) => {
    const device = await SensorDeviceDAO.findByDid(params.did);
    if (!device) throw new APIException("NOT_FOUND", "Sensor not found");

    const workloads = await SensorWorkloadDAO.listByDevice(params.did);

    const body: SensorDeviceDetail = {
      ...device,
      online: isOnline(params.did),
      workloads,
    };
    return { status: 200, body };
  },

  // ── PATCH /api/admin/sensors/:did — assign (or unassign) a user ─────────────
  assignUser: async ({ params, body }) => {
    const device = await SensorDeviceDAO.findByDid(params.did);
    if (!device) throw new APIException("NOT_FOUND", "Sensor not found");

    await SensorDeviceDAO.assignUser(params.did, body.assignedUserId);

    const updated = await SensorDeviceDAO.findByDid(params.did);
    if (!updated) throw new APIException("NOT_FOUND", "Sensor not found");

    const responseBody: SensorDeviceInfo = {
      ...updated,
      online: isOnline(params.did),
    };
    return { status: 200, body: responseBody };
  },

  // ── DELETE /api/admin/sensors/:did — remove a decommissioned sensor ─────────
  deleteSensor: async ({ params }) => {
    const device = await SensorDeviceDAO.findByDid(params.did);
    if (!device) throw new APIException("NOT_FOUND", "Sensor not found");
    await SensorDeviceDAO.delete(params.did);
    return { status: 204, body: undefined };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
