import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";
import type { Policy } from "@prisma/client";

const IdParam = z.object({ id: z.string().min(1) });

export const policiesContract = c.router({
  list: {
    method: "GET",
    path: "/api/policies",
    summary: "List all policies",
    query: z.object({
      agentDid: z.string().optional(),
      realmId: z.string().optional(),
      includeExpired: z.coerce.boolean().optional(),
      expiredOnly: z.coerce.boolean().optional(),
    }),
    responses: { 200: c.type<{ policies: Policy[] }>(), ...commonErrorResponses },
  },

  create: {
    method: "POST",
    path: "/api/policies",
    summary: "Create and persist a new policy",
    body: z.object({
      agentDid: z.string().optional(),
      realmId: z.string().optional(),
      capabilities: z.array(z.string()),
      resourceLimits: z.record(z.string(), z.unknown()).optional(),
      expiresAt: z.string().optional(),
      broadcast: z.boolean().optional(),
    }),
    responses: {
      201: c.type<{ policy: Policy; sentTo: string[] }>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/policies/:id",
    pathParams: IdParam,
    summary: "Retrieve a policy by ID",
    responses: { 200: c.type<{ policy: Policy }>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/policies/:id",
    pathParams: IdParam,
    summary: "Revoke a policy",
    responses: {
      200: z.object({ ok: z.boolean(), sentTo: z.array(z.string()) }),
      ...commonErrorResponses,
    },
  },
});
