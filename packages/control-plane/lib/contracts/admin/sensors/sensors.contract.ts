import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses, PaginatedResponse } from "../../common";
import {
  ListSensorsQuerySchema,
  AssignSensorUserBodySchema,
} from "./sensors.schemas";
import type {
  SensorDeviceInfo,
  SensorDeviceDetail,
  SensorStats,
} from "./sensors.types";

export const sensorsContract = c.router({
  // ─── List / Search ───────────────────────────────────────────────────────────

  search: {
    method: "GET",
    path: "/api/admin/sensors",
    query: ListSensorsQuerySchema,
    responses: {
      200: c.type<PaginatedResponse<SensorDeviceInfo>>(),
      ...commonErrorResponses,
    },
  },

  // ─── Fleet stats ─────────────────────────────────────────────────────────────

  stats: {
    method: "GET",
    path: "/api/admin/sensors/stats",
    responses: {
      200: c.type<SensorStats>(),
      ...commonErrorResponses,
    },
  },

  // ─── Sensor CRUD ─────────────────────────────────────────────────────────────

  getSensor: {
    method: "GET",
    path: "/api/admin/sensors/:did",
    pathParams: z.object({ did: z.string() }),
    responses: {
      200: c.type<SensorDeviceDetail>(),
      ...commonErrorResponses,
    },
  },

  assignUser: {
    method: "PATCH",
    path: "/api/admin/sensors/:did",
    pathParams: z.object({ did: z.string() }),
    body: AssignSensorUserBodySchema,
    responses: {
      200: c.type<SensorDeviceInfo>(),
      ...commonErrorResponses,
    },
  },

  deleteSensor: {
    method: "DELETE",
    path: "/api/admin/sensors/:did",
    pathParams: z.object({ did: z.string() }),
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },
});
