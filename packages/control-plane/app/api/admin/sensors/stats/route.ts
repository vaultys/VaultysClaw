import { SensorDeviceDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import type { SensorStats } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { getWSServer } from "@/lib/ws-server";

const handlers = createNextRoute(adminContract.sensors, {
  // ── GET /api/admin/sensors/stats — fleet-wide summary for the Sensors page ──
  stats: async () => {
    const base = await SensorDeviceDAO.stats();
    const onlineSensors = getWSServer()?.listConnectedSensorDids().length ?? 0;

    const body: SensorStats = { ...base, onlineSensors };
    return { status: 200, body };
  },
});

export const GET = handlers.GET!;
