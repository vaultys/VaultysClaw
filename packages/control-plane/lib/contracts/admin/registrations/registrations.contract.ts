import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  RegistrationIdParamSchema,
  BatchRejectBodySchema,
  RejectRegistrationBodySchema,
  ApproveRegistrationBodySchema,
} from "./registrations.schemas";
import type {
  CapabilityOption,
  PendingRegistration,
} from "./registrations.types";

export const registrationsContract = c.router({
  list: {
    method: "GET",
    path: "/api/admin/registrations",
    summary: "List all pending registrations and available capabilities",
    responses: {
      200: c.type<{
        registrations: PendingRegistration[];
        availableCapabilities: CapabilityOption[];
      }>(),
      ...commonErrorResponses,
    },
  },

  batchReject: {
    method: "POST",
    path: "/api/admin/registrations/batch",
    summary: "Reject multiple pending registrations at once",
    body: BatchRejectBodySchema,
    responses: {
      200: z.object({
        rejected: z.array(z.string()),
        notFound: z.array(z.string()),
      }),
      ...commonErrorResponses,
    },
  },

  reject: {
    method: "POST",
    path: "/api/admin/registrations/:id/reject",
    pathParams: RegistrationIdParamSchema,
    summary: "Reject a pending registration",
    body: RejectRegistrationBodySchema,
    responses: {
      200: z.object({ success: z.boolean(), registrationId: z.string() }),
      ...commonErrorResponses,
    },
  },

  approve: {
    method: "POST",
    path: "/api/admin/registrations/:id/approve",
    pathParams: RegistrationIdParamSchema,
    summary: "Approve a pending registration with selected capabilities",
    body: ApproveRegistrationBodySchema,
    responses: {
      200: z.object({
        success: z.boolean(),
        registrationId: z.string(),
        capabilities: z.array(z.string()),
        agentDid: z.string().nullable(),
      }),
      ...commonErrorResponses,
    },
  },
});

// toolApprovalsContract moved to userContract.toolApprovals
// (lib/contracts/user/tool-approvals) — gated by auth only, not admin.
