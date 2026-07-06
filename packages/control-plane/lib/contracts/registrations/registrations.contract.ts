import { z } from "zod";
import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  RegistrationIdParamSchema,
  BatchRejectBodySchema,
  RejectRegistrationBodySchema,
  ApproveRegistrationBodySchema,
  ToolApprovalRespondBodySchema,
} from "./registrations.schemas";
import type {
  CapabilityOption,
  PendingRegistration,
} from "./registrations.types";
import { ToolApproval } from "@/lib/ws-server";

export const registrationsContract = c.router({
  list: {
    method: "GET",
    path: "/api/registrations",
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
    path: "/api/registrations/batch",
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
    path: "/api/registrations/:id/reject",
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
    path: "/api/registrations/:id/approve",
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

export const toolApprovalsContract = c.router({
  list: {
    method: "GET",
    path: "/api/tool-approvals",
    summary: "List pending tool approval requests",
    responses: {
      200: c.type<{
        approvals: ToolApproval[];
      }>(),
      ...commonErrorResponses,
    },
  },

  respond: {
    method: "POST",
    path: "/api/tool-approvals",
    summary: "Respond to a tool approval request",
    body: ToolApprovalRespondBodySchema,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});
