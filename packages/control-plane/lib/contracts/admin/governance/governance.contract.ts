import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { AuditQuerySchema, AuditEntryParamsSchema } from "./governance.schemas";
import type {
  GovernanceSummary,
  AuditResponse,
  AuditEntryDetailResponse,
} from "./governance.types";

export const governanceContract = c.router({
  summary: {
    method: "GET",
    path: "/api/admin/governance/summary",
    summary: "Retrieve governance posture statistics",
    responses: {
      200: c.type<GovernanceSummary>(),
      ...commonErrorResponses,
    },
  },

  audit: {
    method: "GET",
    path: "/api/admin/governance/audit",
    summary: "Retrieve a unified audit stream of activity and intent logs",
    query: AuditQuerySchema,
    responses: {
      200: c.type<AuditResponse>(),
      ...commonErrorResponses,
    },
  },

  auditEntry: {
    method: "GET",
    path: "/api/admin/governance/audit/:id",
    pathParams: AuditEntryParamsSchema,
    summary: "Retrieve a single audit entry with full details and metadata",
    responses: {
      200: c.type<AuditEntryDetailResponse>(),
      ...commonErrorResponses,
    },
  },
});
