import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import type { OtelConfig } from "./settings.types";

/**
 * Reading OpenTelemetry status is gated by authentication only (any user).
 * Saving / testing OTel config is admin-only — see adminContract.settings.
 */
export const otelSettingsContract = c.router({
  getOtel: {
    method: "GET",
    path: "/api/settings/otel",
    summary: "Retrieve OpenTelemetry configuration and status",
    responses: { 200: c.type<OtelConfig>(), ...commonErrorResponses },
  },
});
