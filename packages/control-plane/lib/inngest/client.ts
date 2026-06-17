/**
 * Inngest client + event payload types (P1 spike).
 *
 * This is the durable-execution backend prototype evaluated in WORKFLOW_ROADMAP.md.
 * The SDK (this package) is Apache-2.0; the self-hosted server is SSPL+DOSP and is
 * used purely as our internal orchestration engine (not exposed to customers), so
 * the SSPL "as a service" clause is not triggered.
 *
 * In dev, point the SDK at the Inngest Dev Server (docker-compose.inngest.yml).
 * For self-hosted prod, the same binary is backed by Postgres + Redis.
 *
 * Note: inngest v4 replaced the `EventSchemas` builder with `eventType()`/`staticSchema`
 * triggers. For the spike we keep payloads typed at the boundary with the types below
 * and cast at the event edges; wiring full v4 typed triggers is a follow-up.
 */

import { Inngest } from "inngest";

export type WorkflowRunRequestedData = {
  runId: string;
  workflowId: string;
  input?: string;
  realmId?: string;
};

export type WorkflowApprovalResolvedData = {
  runId: string;
  stepId: string; // workflow node id
  approvalId: string;
  decision: "approved" | "rejected";
  decidedBy: string;
  comment?: string;
};

export const EVT_RUN_REQUESTED = "workflow/run.requested" as const;
export const EVT_APPROVAL_RESOLVED = "workflow/approval.resolved" as const;

export const inngest = new Inngest({ id: "vaultysclaw-control-plane" });

/** True when the Inngest-backed workflow engine is selected. */
export function isInngestEngine(): boolean {
  return process.env.WORKFLOW_ENGINE === "inngest";
}
