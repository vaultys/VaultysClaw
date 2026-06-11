import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

export const registrationsContract = c.router({
  list: {
    method: "GET",
    path: "/api/registrations",
    summary: "List all pending registrations and available capabilities",
    responses: {
      200: c.type<{
        registrations: Array<Record<string, unknown>>;
        availableCapabilities: Array<{ id: string; label: string; description: string }>;
      }>(),
      ...commonErrorResponses,
    },
  },

  batchReject: {
    method: "POST",
    path: "/api/registrations/batch",
    summary: "Reject multiple pending registrations at once",
    body: z.object({ ids: z.array(z.string()), reason: z.string().optional() }),
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
    pathParams: z.object({ id: z.string() }),
    summary: "Reject a pending registration",
    body: z.object({ reason: z.string().optional() }),
    responses: {
      200: z.object({ success: z.boolean(), registrationId: z.string() }),
      ...commonErrorResponses,
    },
  },

  approve: {
    method: "POST",
    path: "/api/registrations/:id/approve",
    pathParams: z.object({ id: z.string() }),
    summary: "Approve a pending registration with selected capabilities",
    body: z.object({
      capabilities: z.array(z.string()).optional(),
      realmIds: z.array(z.string()).optional(),
    }),
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
      200: c.type<{ approvals: Array<Record<string, unknown>> }>(),
      ...commonErrorResponses,
    },
  },

  respond: {
    method: "POST",
    path: "/api/tool-approvals",
    summary: "Respond to a tool approval request",
    body: z.object({
      requestId: z.string(),
      approved: z.boolean(),
      reason: z.string().optional(),
    }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },
});
