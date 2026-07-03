import { z } from "zod";
import type { PendingRegistration } from "@prisma/client";
import type { AgentCapability } from "@vaultysclaw/shared";
import {
  BatchRejectBodySchema,
  RejectRegistrationBodySchema,
  ApproveRegistrationBodySchema,
  ToolApprovalRespondBodySchema,
} from "./registrations.schemas";

// The persisted registration row is owned by Prisma — reuse it directly.
export type { PendingRegistration };

/** A capability the admin may assign when approving an agent. */
export interface CapabilityOption {
  id: AgentCapability;
  label: string;
  description: string;
}

export type BatchRejectBody = z.infer<typeof BatchRejectBodySchema>;
export type RejectRegistrationBody = z.infer<typeof RejectRegistrationBodySchema>;
export type ApproveRegistrationBody = z.infer<
  typeof ApproveRegistrationBodySchema
>;
export type ToolApprovalRespondBody = z.infer<
  typeof ToolApprovalRespondBodySchema
>;
