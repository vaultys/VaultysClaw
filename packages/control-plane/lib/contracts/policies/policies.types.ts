import { z } from "zod";
import { CreatePolicyBodySchema } from "./policies.schemas";

// ── Body types
export type CreatePolicyBody = z.infer<typeof CreatePolicyBodySchema>;

// ── Responses
//
// The policy wire types (PolicyResourceLimits, PolicyEntry) are owned by the
// `@vaultysclaw/policy` package and re-exported here so existing imports from
// the contracts module keep working.
export type { PolicyResourceLimits, PolicyEntry } from "@vaultysclaw/policy";
