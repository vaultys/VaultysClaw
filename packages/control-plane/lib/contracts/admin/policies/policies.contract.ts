import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  ListPoliciesQuerySchema,
  CreatePolicyBodySchema,
  PolicyIdParamSchema,
  RemovePolicyResponseSchema,
} from "./policies.schemas";
import type { PolicyEntry } from "./policies.types";

export const policiesContract = c.router({
  list: {
    method: "GET",
    path: "/api/admin/policies",
    summary: "List all policies",
    query: ListPoliciesQuerySchema,
    responses: {
      200: c.type<{ policies: PolicyEntry[] }>(),
      ...commonErrorResponses,
    },
  },

  create: {
    method: "POST",
    path: "/api/admin/policies",
    summary: "Create and persist a new policy",
    body: CreatePolicyBodySchema,
    responses: {
      201: c.type<{ policy: PolicyEntry; sentTo: string[] }>(),
      ...commonErrorResponses,
    },
  },

  getOne: {
    method: "GET",
    path: "/api/admin/policies/:id",
    pathParams: PolicyIdParamSchema,
    summary: "Retrieve a policy by ID",
    responses: {
      200: c.type<{ policy: PolicyEntry }>(),
      ...commonErrorResponses,
    },
  },

  remove: {
    method: "DELETE",
    path: "/api/admin/policies/:id",
    pathParams: PolicyIdParamSchema,
    summary: "Revoke a policy",
    responses: {
      200: RemovePolicyResponseSchema,
      ...commonErrorResponses,
    },
  },
});
