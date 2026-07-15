import { z } from "zod";
import { ToolApprovalRespondBodySchema } from "./tool-approvals.schemas";

export type ToolApprovalRespondBody = z.infer<
  typeof ToolApprovalRespondBodySchema
>;
