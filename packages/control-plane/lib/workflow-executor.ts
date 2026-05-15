/**
 * Workflow Executor — orchestrates DAG execution
 *
 * Responsibilities:
 * - Parse workflow definition (DAG)
 * - Topological sort for execution order
 * - Handle conditional branching
 * - Track step completion
 * - Forward outputs to dependent steps
 * - Support mock agents for demos
 */

import pino from "pino";
import {
  updateWorkflowRunStatus,
  recordWorkflowStep,
  updateWorkflowStep,
  getWorkflowRunSteps,
  createWorkflowApproval,
  resolveWorkflowApproval,
  getApprovalsForRun,
  getWorkflow,
  type WorkflowDefinition,
} from "./db";

const logger = pino({ name: "workflow-executor" });

export interface WorkflowNode {
  id: string;
  type: string; // "agent", "condition", "parallel", "delay", "custom", "user"
  data: {
    agentId?: string;
    params?: Record<string, unknown>;
    expression?: string; // for condition nodes
    duration?: number; // for delay nodes
    [key: string]: unknown;
  };
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    condition?: string; // for conditional edges
    [key: string]: unknown;
  };
}

export interface ExecutionContext {
  runId: string;
  stepOutputs: Map<string, unknown>; // step_id -> output
  stepStatus: Map<string, string>; // step_id -> status
  stepIds: Map<string, string>; // node_id -> step_id in DB
}

/**
 * Parse and validate workflow definition
 */
export function parseWorkflow(definition: WorkflowDefinition): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  return {
    nodes: definition.nodes as WorkflowNode[],
    edges: definition.edges as WorkflowEdge[],
  };
}

/**
 * Topological sort of workflow nodes
 * Returns node IDs in execution order, or null if cycle detected
 */
export function topologicalSort(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): string[] | null {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  const adjList = new Map(nodes.map((n) => [n.id, [] as string[]]));

  // Build adjacency list and in-degree
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjList.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = Array.from(nodeIds).filter((id) => inDegree.get(id) === 0);
  const result: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const neighbor of adjList.get(node) ?? []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all nodes were visited, there's a cycle
  return result.length === nodeIds.size ? result : null;
}

/**
 * Get all nodes that depend on a given node
 */
export function getDependentNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

/**
 * Get all nodes that a given node depends on
 */
export function getDependencyNodes(nodeId: string, edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter((e) => e.target === nodeId);
}

/**
 * Evaluate a condition expression in the context of step outputs
 * Simple implementation: supports basic JS expressions
 */
export function evaluateCondition(
  expression: string,
  context: Record<string, unknown>,
): boolean {
  try {
    // Safe eval using Function constructor with limited scope
    const fn = new Function(...Object.keys(context), `return ${expression}`);
    return Boolean(fn(...Object.values(context)));
  } catch (err) {
    logger.error({ expression, error: String(err) }, "Failed to evaluate condition");
    return false;
  }
}

/**
 * Check if all dependencies of a node are completed
 */
export function areDependenciesMet(
  nodeId: string,
  edges: WorkflowEdge[],
  stepStatus: Map<string, string>,
): boolean {
  const deps = getDependencyNodes(nodeId, edges);
  if (deps.length === 0) return true;

  return deps.every((dep) => {
    const status = stepStatus.get(dep.source);
    if (!status) return false;

    // Check condition on edge if present
    if (dep.data?.condition) {
      const sourceOutput = stepStatus.get(dep.source);
      // For now, we'll consider conditions as met if dependency is successful
      // Full implementation would evaluate the condition
      return status === "success";
    }

    return status === "success";
  });
}

/**
 * Interpolate variables in params using step outputs
 * Supports syntax: ${stepId.output.fieldName}
 */
export function interpolateParams(
  params: Record<string, unknown>,
  context: Map<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      // Replace ${...} patterns with context values
      result[key] = value.replace(/\$\{([^}]+)\}/g, (match, path) => {
        const parts = path.split(".");
        let current: unknown = context.get(parts[0]);

        for (let i = 1; i < parts.length && current != null; i++) {
          current = (current as Record<string, unknown>)[parts[i]];
        }

        return String(current ?? match);
      });
    } else if (typeof value === "object" && value !== null) {
      result[key] = interpolateParams(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Execute a single workflow step
 */
export async function executeStep(
  stepId: string,
  node: WorkflowNode,
  params: Record<string, unknown>,
  context: ExecutionContext,
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  try {
    const stepDbId = context.stepIds.get(stepId);
    if (!stepDbId) {
      return { success: false, error: "Step not found in execution context" };
    }

    updateWorkflowStep(stepDbId, "running");

    // Determine agent to execute
    const agentId = node.data.agentId ?? "@mock-agent";

    // Mock agent execution (for testing without real agents)
    if (agentId === "@mock-agent") {
      const duration = (node.data.duration as number) ?? 1000;
      const mockOutput = {
        nodeId: node.id,
        nodeType: node.type,
        timestamp: new Date().toISOString(),
        status: "success",
        message: `Mock execution of ${node.type} node`,
      };

      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, duration));

      context.stepOutputs.set(stepId, mockOutput);
      context.stepStatus.set(stepId, "success");
      updateWorkflowStep(stepDbId, "success", mockOutput);

      logger.info({ stepId, nodeType: node.type }, "Step completed (mock)");
      return { success: true, output: mockOutput };
    }

    // Real agent execution via WebSocket
    try {
      const { getWSServer } = await import("./ws-server");
      const wsServer = getWSServer();
      if (!wsServer) {
        return { success: false, error: "WebSocket server not available" };
      }

      // Generate unique intent ID for this execution
      const intentId = `workflow-step-${context.runId}-${stepId}-${Date.now()}`;

      // Determine action from node type
      const action = (node.data.action as string) || node.type;

      // Create a promise that resolves when the agent sends a result
      const resultPromise = new Promise<any>((resolve, reject) => {
        const unsubscribe = wsServer.registerResultCallback(intentId, (result) => {
          unsubscribe();
          resolve(result);
        });

        // Timeout after 30 seconds if no result
        setTimeout(() => {
          unsubscribe();
          reject(new Error(`Agent execution timeout for ${agentId}`));
        }, 30_000);
      });

      // Send the intent to the agent
      const sent = wsServer.sendIntentToAgent(agentId, intentId, action, params);
      if (!sent) {
        return { success: false, error: `Agent ${agentId} is not connected` };
      }

      logger.info({ stepId, agentId, intentId, action }, "Intent sent to agent");

      // Wait for the result
      const result = await resultPromise;

      if (result.status === "success" || result.status === "completed") {
        const output = result.output || result.data || result;
        context.stepOutputs.set(stepId, output);
        context.stepStatus.set(stepId, "success");
        updateWorkflowStep(stepDbId, "success", output);
        logger.info({ stepId, agentId, intentId }, "Step completed (agent)");
        return { success: true, output };
      } else {
        const errorMsg = result.error || result.message || "Agent execution failed";
        logger.error({ stepId, agentId, error: errorMsg }, "Agent execution failed");
        updateWorkflowStep(stepDbId, "failed", undefined, errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (agentError) {
      const errorMsg = String(agentError);
      logger.error({ stepId, agentId, error: errorMsg }, "Agent execution error");
      updateWorkflowStep(stepDbId, "failed", undefined, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    const errorMsg = String(err);
    logger.error({ stepId, error: errorMsg }, "Step execution failed");
    const stepDbId = context.stepIds.get(stepId);
    if (stepDbId) {
      updateWorkflowStep(stepDbId, "failed", undefined, errorMsg);
    }
    return { success: false, error: errorMsg };
  }
}

/**
 * Main workflow executor
 */
export async function executeWorkflow(
  runId: string,
  definition: WorkflowDefinition,
  input?: string,
  workflowId?: string,
): Promise<void> {
  try {
    const { nodes, edges } = parseWorkflow(definition);

    // Validate workflow
    const sorted = topologicalSort(nodes, edges);
    if (!sorted) {
      logger.error({ runId }, "Workflow contains a cycle");
      updateWorkflowRunStatus(runId, "failed", { error: "Workflow contains a cycle" });
      return;
    }

    // Resolve workflow name for approval records
    const workflowRow = workflowId ? getWorkflow(workflowId) : undefined;
    const workflowName = workflowRow?.name ?? "Workflow";

    // Initialize execution context
    const context: ExecutionContext = {
      runId,
      stepOutputs: new Map(),
      stepStatus: new Map(),
      stepIds: new Map(),
    };

    // If input provided, store it in the context as a well-known "input" key
    if (input) {
      context.stepOutputs.set("input", { text: input, value: input });
    }

    // Create step records in DB
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const nodeId of sorted) {
      const node = nodeMap.get(nodeId)!;
      const stepId = recordWorkflowStep(runId, nodeId, node.data.agentId as string | undefined);
      context.stepIds.set(nodeId, stepId);
      context.stepStatus.set(nodeId, "pending");
    }

    // Inject input into the first node's params if provided
    const firstNodeId = sorted[0];
    if (input && firstNodeId) {
      const firstNode = nodeMap.get(firstNodeId)!;
      const existingParams = (firstNode.data.params as Record<string, unknown>) ?? {};
      // Only inject if not already set
      if (!existingParams.input) {
        firstNode.data.params = { ...existingParams, input };
      }
    }

    // Execute nodes in topological order
    for (const nodeId of sorted) {
      const node = nodeMap.get(nodeId)!;

      // Check if dependencies are met
      if (!areDependenciesMet(nodeId, edges, context.stepStatus)) {
        logger.info({ nodeId }, "Dependencies not met, skipping step");
        continue;
      }

      // Handle user node (approval / notification)
      if (node.type === "user") {
        const assignedUserId = node.data.assignedUserId as string | undefined;
        const mode = (node.data.mode as "approval" | "notification") ?? "approval";
        const stepDbId = context.stepIds.get(nodeId)!;

        if (!assignedUserId) {
          // No user configured — skip this node and continue
          logger.warn({ nodeId }, "User node has no assigned user, skipping");
          context.stepStatus.set(nodeId, "success");
          updateWorkflowStep(stepDbId, "success", { skipped: true, reason: "No user assigned" });
          continue;
        }

        // Collect current step input for display
        const stepInput = input
          ? input
          : JSON.stringify(Object.fromEntries(context.stepOutputs), null, 2).slice(0, 500);

        // Create approval/notification record
        const approvalId = createWorkflowApproval({
          runId,
          stepId: nodeId,
          workflowId: workflowId ?? "",
          workflowName,
          nodeMessage: node.data.message as string | undefined,
          stepInput,
          assignedUserId,
          mode,
        });

        if (mode === "notification") {
          // Fire-and-forget: mark step as success and continue
          context.stepStatus.set(nodeId, "success");
          updateWorkflowStep(stepDbId, "success", { notificationId: approvalId });
          logger.info({ nodeId, approvalId }, "Notification sent, continuing");
          continue;
        }

        // Approval mode: pause and poll until resolved or timeout
        const timeoutMinutes = (node.data.timeout as number | undefined) ?? 0;
        const deadline = timeoutMinutes > 0 ? Date.now() + timeoutMinutes * 60_000 : Infinity;

        updateWorkflowRunStatus(runId, "waiting_approval");
        updateWorkflowStep(stepDbId, "waiting_approval");

        logger.info({ nodeId, approvalId, assignedUserId }, "Workflow paused waiting for approval");

        // Poll every 10 seconds
        const approved = await new Promise<boolean>((resolve) => {
          const interval = setInterval(() => {
            const approvals = getApprovalsForRun(runId);
            const record = approvals.find((a) => a.id === approvalId);
            if (!record) { clearInterval(interval); return resolve(false); }

            if (record.status === "approved") { clearInterval(interval); return resolve(true); }
            if (record.status === "rejected") { clearInterval(interval); return resolve(false); }

            if (Date.now() > deadline) {
              clearInterval(interval);
              logger.warn({ nodeId, approvalId }, "Approval timed out, auto-continuing");
              resolve(true);
            }
          }, 10_000);
        });

        updateWorkflowRunStatus(runId, "running");

        if (!approved) {
          updateWorkflowStep(stepDbId, "failed", undefined, "Approval rejected");
          updateWorkflowRunStatus(runId, "rejected", { rejectedNode: nodeId, approvalId });
          logger.info({ nodeId, approvalId }, "Workflow rejected by user");
          return;
        }

        context.stepStatus.set(nodeId, "success");
        updateWorkflowStep(stepDbId, "success", { approvalId, approved: true });
        continue;
      }

      // Interpolate params with context
      const params = interpolateParams(
        (node.data.params as Record<string, unknown>) ?? {},
        context.stepOutputs,
      );

      // Execute step
      const result = await executeStep(nodeId, node, params, context);

      if (!result.success) {
        logger.error({ nodeId, error: result.error }, "Step failed, workflow halted");
        updateWorkflowRunStatus(runId, "failed", {
          failedNode: nodeId,
          error: result.error,
        });
        return;
      }
    }

    // Workflow completed successfully
    updateWorkflowRunStatus(runId, "completed", {
      completedNodes: sorted.length,
      outputs: Object.fromEntries(context.stepOutputs),
    });

    logger.info({ runId }, "Workflow completed successfully");
  } catch (err) {
    logger.error({ runId, error: String(err) }, "Workflow execution failed");
    updateWorkflowRunStatus(runId, "failed", { error: String(err) });
  }
}
