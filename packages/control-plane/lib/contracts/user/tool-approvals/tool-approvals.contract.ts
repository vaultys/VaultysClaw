import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import { ToolApprovalRespondBodySchema } from "./tool-approvals.schemas";
import { ToolApproval } from "@/lib/ws-server";

/**
 * Tool-approval queue — gated by authentication only (any user can respond to
 * approvals for agents they interact with). Not admin-only.
 */
export const toolApprovalsContract = c.router({
  list: {
    method: "GET",
    path: "/api/tool-approvals",
    summary: "List pending tool approval requests",
    responses: {
      200: c.type<{ approvals: ToolApproval[] }>(),
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
