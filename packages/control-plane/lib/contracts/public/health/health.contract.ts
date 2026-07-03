import { c } from "../../contract";
import { HealthResponseSchema } from "./health.schemas";

export const healthContract = c.router({
  get: {
    method: "GET",
    path: "/api/health",
    summary: "Health check for the control plane",
    responses: { 200: HealthResponseSchema },
  },
});
