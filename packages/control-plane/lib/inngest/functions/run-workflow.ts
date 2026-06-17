/**
 * Durable workflow runner (P1 spike).
 *
 * Ports the DAG walk from `lib/workflow-executor.ts` (executeWorkflow) onto Inngest
 * durable steps. The point of the spike is to prove the migration path for ALL
 * workflows, not just one — so this is a generic interpreter over WorkflowDefinition.
 *
 * What the durable model buys us versus the hand-rolled executor:
 *   - Each node is a `step.run(...)` → result is checkpointed. On crash/restart Inngest
 *     replays the function and skips completed steps, feeding back memoized outputs.
 *     This replaces the manual "which steps already ran" bookkeeping.
 *   - Approval gates become `step.waitForEvent(...)` → zero-resource indefinite waits,
 *     replacing the 10s DB poll loop in executeWorkflow.
 *   - Per-step retries/backoff + per-step timeout come from config, not custom code.
 *   - `step.sleep` replaces the delay-node setTimeout.
 *
 * Idempotency note (roadmap P1 task): because steps may be replayed, the code INSIDE a
 * step.run must be safe to re-run if it never returned. Side-effecting agent intents
 * (Slack post, file write) are wrapped so a *completed* step is never re-fired — Inngest
 * memoizes the return value. New side effects only happen on first execution of a step.
 */

import { NonRetriableError, type GetStepTools } from "inngest";
import {
  inngest,
  EVT_RUN_REQUESTED,
  EVT_APPROVAL_RESOLVED,
  type WorkflowRunRequestedData,
  type WorkflowApprovalResolvedData,
} from "../client";
import { WorkflowDAO } from "../../../db";
import {
  parseWorkflow,
  topologicalSort,
  getDependencyNodes,
  interpolateParams,
  executeStep,
  type ExecutionContext,
  type WorkflowDefinition,
  type WorkflowNode,
} from "../../workflow-executor";

export const runWorkflow = inngest.createFunction(
  {
    id: "run-workflow",
    // Safe to retry the orchestration itself — completed steps are memoized.
    retries: 2,
    triggers: [{ event: EVT_RUN_REQUESTED }],
  },
  async ({ event, step, logger }) => {
    const { runId, workflowId, input, realmId } =
      event.data as WorkflowRunRequestedData;

    const workflow = await step.run("load-workflow", async () => {
      const wf = await WorkflowDAO.findById(workflowId);
      if (!wf) throw new NonRetriableError(`Workflow ${workflowId} not found`);
      return wf;
    });

    const definition = workflow.definition as unknown as WorkflowDefinition;
    const { nodes, edges } = parseWorkflow(definition);

    const sorted = topologicalSort(nodes, edges);
    if (!sorted) {
      await step.run("mark-cycle-failed", () =>
        WorkflowDAO.updateRunStatus(runId, "failed", {
          error: "Workflow contains a cycle",
        })
      );
      return { status: "failed", reason: "cycle" };
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Create DB step rows once; memoized so replays don't duplicate them.
    const stepDbIds = await step.run("record-steps", async () => {
      const map: Record<string, string> = {};
      for (const nodeId of sorted) {
        const node = nodeMap.get(nodeId)!;
        map[nodeId] = await WorkflowDAO.recordStep(
          runId,
          nodeId,
          node.data.agentId as string | undefined
        );
      }
      return map;
    });

    await step.run("mark-running", () =>
      WorkflowDAO.updateRunStatus(runId, "running")
    );

    // Accumulated outputs, rebuilt deterministically from memoized step results
    // on every (re)invocation. Keyed by node id, plus the well-known "input" key.
    const outputs: Record<string, unknown> = {};
    if (input) outputs.input = { text: input, value: input };

    const statusByNode = new Map<string, string>();

    for (const nodeId of sorted) {
      const node = nodeMap.get(nodeId)!;

      // Dependency gate — every predecessor must have succeeded.
      const deps = getDependencyNodes(nodeId, edges);
      const depsMet = deps.every(
        (d) => statusByNode.get(d.source) === "success"
      );
      if (!depsMet) {
        statusByNode.set(nodeId, "skipped");
        continue;
      }

      // ── User node: approval / notification ────────────────────────────────
      if (node.type === "user") {
        const outcome = await handleUserNode(
          node,
          nodeId,
          { runId, workflowId, workflowName: workflow.name },
          outputs,
          stepDbIds[nodeId],
          step,
          input
        );
        if (outcome === "rejected") {
          await step.run("mark-rejected", () =>
            WorkflowDAO.updateRunStatus(runId, "rejected", {
              rejectedNode: nodeId,
            })
          );
          return { status: "rejected", node: nodeId };
        }
        statusByNode.set(nodeId, "success");
        outputs[nodeId] = { approved: true };
        continue;
      }

      // ── Delay node: durable sleep ─────────────────────────────────────────
      if (node.type === "delay") {
        const ms = (node.data.duration as number) ?? 1000;
        await step.sleep(`delay:${nodeId}`, `${ms}ms`);
        statusByNode.set(nodeId, "success");
        outputs[nodeId] = { delayed: ms };
        continue;
      }

      // ── Agent / skill / condition node: durable step.run ──────────────────
      const params = interpolateParams(
        (node.data.params as Record<string, unknown>) ?? {},
        new Map(Object.entries(outputs))
      );

      const result = await step.run(`node:${nodeId}`, async () => {
        // executeStep handles agent resolution, skill dispatch, WS intent + DB
        // writes. Wrapped in step.run so a completed node is memoized and never
        // re-fires its side effects on replay.
        const ctx: ExecutionContext = {
          runId,
          stepOutputs: new Map(Object.entries(outputs)),
          stepStatus: new Map(),
          stepIds: new Map(Object.entries(stepDbIds)),
          realmId: realmId ?? workflow.realmId ?? undefined,
        };
        return executeStep(nodeId, node, params, ctx);
      });

      if (!result.success) {
        await step.run("mark-failed", () =>
          WorkflowDAO.updateRunStatus(runId, "failed", {
            failedNode: nodeId,
            error: result.error,
          })
        );
        return { status: "failed", node: nodeId, error: result.error };
      }

      statusByNode.set(nodeId, "success");
      outputs[nodeId] = result.output;
    }

    await step.run("mark-completed", () =>
      WorkflowDAO.updateRunStatus(runId, "completed", {
        completedNodes: sorted.length,
        outputs,
      })
    );

    logger.info({ runId }, "Durable workflow completed");
    return { status: "completed", nodes: sorted.length };
  }
);

type StepTools = GetStepTools<typeof inngest>;

/**
 * Approval / notification node. For approval mode the function suspends on
 * `step.waitForEvent` until the approve/reject API emits `workflow/approval.resolved`
 * (or the configured timeout elapses → auto-continue, matching legacy behaviour).
 */
export async function handleUserNode(
  node: WorkflowNode,
  nodeId: string,
  meta: { runId: string; workflowId: string; workflowName: string },
  outputs: Record<string, unknown>,
  stepDbId: string,
  step: StepTools,
  input?: string
): Promise<"approved" | "rejected"> {
  const assignedUserId = node.data.assignedUserId as string | undefined;
  const mode = (node.data.mode as "approval" | "notification") ?? "approval";

  if (!assignedUserId) {
    await step.run(`user-skip:${nodeId}`, () =>
      WorkflowDAO.updateStep(stepDbId, {
        status: "success",
        output: { skipped: true, reason: "No user assigned" },
      })
    );
    return "approved";
  }

  const approvalId = await step.run(`create-approval:${nodeId}`, async () => {
    const stepInput = input
      ? input
      : JSON.stringify(outputs, null, 2).slice(0, 500);
    return WorkflowDAO.createApproval({
      runId: meta.runId,
      stepId: nodeId,
      workflowId: meta.workflowId,
      workflowName: meta.workflowName,
      nodeMessage: node.data.message as string | undefined,
      stepInput,
      assignedUserId,
      mode,
    });
  });

  if (mode === "notification") {
    await step.run(`notify:${nodeId}`, () =>
      WorkflowDAO.updateStep(stepDbId, {
        status: "success",
        output: { notificationId: approvalId },
      })
    );
    return "approved";
  }

  await step.run(`await-approval-mark:${nodeId}`, async () => {
    await WorkflowDAO.updateRunStatus(meta.runId, "waiting_approval");
    await WorkflowDAO.updateStep(stepDbId, { status: "waiting_approval" });
  });

  const timeoutMinutes = (node.data.timeout as number | undefined) ?? 0;
  const timeout = timeoutMinutes > 0 ? `${timeoutMinutes}m` : "30d";

  // Suspend with no resources held until the matching approval event arrives.
  const resolved = await step.waitForEvent(`wait-approval:${nodeId}`, {
    event: EVT_APPROVAL_RESOLVED,
    timeout,
    if: `async.data.runId == "${meta.runId}" && async.data.stepId == "${nodeId}"`,
  });

  // Null = timed out → auto-continue (matches legacy executeWorkflow behaviour).
  const approvalData = resolved?.data as
    | WorkflowApprovalResolvedData
    | undefined;
  const decision = approvalData?.decision ?? "approved";

  await step.run(`resolve-approval:${nodeId}`, async () => {
    await WorkflowDAO.updateRunStatus(meta.runId, "running");
    await WorkflowDAO.updateStep(stepDbId, {
      status: decision === "rejected" ? "failed" : "success",
      output: { approvalId, decision, timedOut: resolved === null },
      ...(decision === "rejected" ? { error: "Approval rejected" } : {}),
    });
  });

  return decision === "rejected" ? "rejected" : "approved";
}
