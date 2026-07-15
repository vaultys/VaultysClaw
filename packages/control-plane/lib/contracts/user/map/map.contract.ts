import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { MapQuerySchema } from "./map.schemas";
import { MapResponse } from "./map.types";

export const mapContract = c.router({
  get: {
    method: "GET",
    path: "/api/map",
    summary: "Aggregate all located entities into map markers",
    query: MapQuerySchema,
    responses: {
      200: c.type<MapResponse>(),
      ...commonErrorResponses,
    },
  },
});
