/**
 * Bridge: when an approval is decided via the REST API, wake the durable workflow
 * that is suspended on `step.waitForEvent("workflow/approval.resolved")`.
 *
 * Best-effort and engine-gated: a no-op unless the Inngest engine is selected, and
 * failures never break the approve/reject HTTP response.
 */

import { inngest, isInngestEngine } from "./client";
import { WorkflowDAO } from "../../db";

export async function emitApprovalResolved(
  approvalId: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  comment?: string
): Promise<void> {
  if (!isInngestEngine()) return;
  try {
    const approval = await WorkflowDAO.findApproval(approvalId);
    if (!approval) return;
    await inngest.send({
      name: "workflow/approval.resolved",
      data: {
        runId: approval.runId,
        stepId: approval.stepId,
        approvalId,
        decision,
        decidedBy,
        comment,
      },
    });
  } catch (err) {
    console.error("Failed to emit approval.resolved event:", err);
  }
}
