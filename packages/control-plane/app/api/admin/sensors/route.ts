import { SensorDeviceDAO } from "@/db";
import { adminContract } from "@/lib/contracts";
import type { SensorDeviceInfo } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { getWSServer } from "@/lib/ws-server";

const handlers = createNextRoute(adminContract.sensors, {
  // ── GET /api/admin/sensors — list/search sensor devices ─────────────────────
  search: async ({ query }) => {
    const { search, assignedUserId, workspace, page, pageSize } = query;

    const result = await SensorDeviceDAO.query({
      search,
      assignedUserId,
      workspaceId: workspace,
      page,
      pageSize,
    });

    const onlineDids = new Set(getWSServer()?.listConnectedSensorDids() ?? []);
    const items: SensorDeviceInfo[] = result.devices.map((d) => ({
      ...d,
      online: onlineDids.has(d.did),
    }));

    return {
      status: 200,
      body: {
        items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    };
  },
});

export const GET = handlers.GET!;
