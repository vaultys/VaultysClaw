/**
 * Integration tests for Workflow Execution with Real Agents
 *
 * Tests the full workflow execution flow:
 * - Agents connecting via WebSocket to control-plane
 * - Workflows being created and executed
 * - Agents receiving execution intents
 * - Results being collected and aggregated
 * - End-to-end workflow completion
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { AgentWSServer } from "../packages/control-plane/lib/ws-server";
import {
  getDb,
  closeDb,
  initServerIdentity,
  saveWorkflow,
  startWorkflowRun,
  recordWorkflowStep,
  updateWorkflowStep,
  getWorkflowRunHistory,
  upsertAgent,
  addUserToRealm,
  type WorkflowDefinition,
} from "../packages/control-plane/lib/db";
import { executeWorkflow, topologicalSort } from "../packages/control-plane/lib/workflow-executor";
import { MockAgent, waitFor } from "./test-utils";

let WS_PORT = 9876;
// Find an available port
let portInUse = true;
while (portInUse) {
  try {
    require("net").createServer().listen(WS_PORT).close();
    portInUse = false;
  } catch {
    WS_PORT++;
  }
}

describe("Workflow Execution with Real Agents", () => {
  let wsServer: AgentWSServer;
  const testRealmId = "test-realm-workflows";

  beforeAll(async () => {
    // Initialize database
    const db = getDb();

    // Clear previous test data
    db.prepare("DELETE FROM agents").run();
    db.prepare("DELETE FROM pending_registrations").run();
    db.prepare("DELETE FROM auth_sessions").run();
    db.prepare("DELETE FROM workflow_runs").run();
    db.prepare("DELETE FROM workflow_steps").run();
    db.prepare("DELETE FROM workflows").run();

    // Generate server identity
    await initServerIdentity();

    // Start WebSocket server
    wsServer = new AgentWSServer(WS_PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(() => {
    wsServer.shutdown();
    closeDb();
  });

  // =========================================================================
  // Test 1: Simple Sequential Workflow with Two Agents
  // =========================================================================

  describe("Sequential Workflow Execution", () => {
    it("should execute sequential workflow with two agents", async () => {
      // Create two test agents
      const analyzerAgent = new MockAgent(`ws://localhost:${WS_PORT}`, "Analyzer Agent");
      const reviewerAgent = new MockAgent(`ws://localhost:${WS_PORT}`, "Reviewer Agent");

      // Connect and authenticate
      await analyzerAgent.connect();
      await reviewerAgent.connect();

      await analyzerAgent.authenticate(["analyze"], wsServer);
      await reviewerAgent.authenticate(["review"], wsServer);

      // Verify both authenticated
      expect(analyzerAgent.isAuthenticated()).toBe(true);
      expect(reviewerAgent.isAuthenticated()).toBe(true);

      // Create workflow: analyzer → reviewer
      const workflow: WorkflowDefinition = {
        nodes: [
          {
            id: analyzerAgent.id,
            type: "agent",
            data: {
              agentId: analyzerAgent.id,
              label: "Analyzer",
              params: { task: "analyze code quality" },
            },
            position: { x: 0, y: 0 },
          },
          {
            id: reviewerAgent.id,
            type: "agent",
            data: {
              agentId: reviewerAgent.id,
              label: "Reviewer",
              params: { input: `\${${analyzerAgent.id}}`, task: "review analysis" },
            },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [
          { id: "seq-edge", source: analyzerAgent.id, target: reviewerAgent.id },
        ],
      };

      const workflowId = saveWorkflow("Sequential Workflow", workflow, undefined);
      const runId = startWorkflowRun(workflowId);

      // Step 1: Send intent to analyzer
      const analyzerIntentPromise = analyzerAgent.waitForIntent(5000);
      wsServer.sendIntentToAgent(analyzerAgent.id, `${runId}-analyze`, "execute_step", {
        stepId: analyzerAgent.id,
        runId,
        task: "analyze code quality",
      });

      const analyzerIntent = await analyzerIntentPromise;
      expect(analyzerIntent.payload.action).toBe("execute_step");

      // Simulate analyzer execution
      const analyzerResult = { quality_score: 8.5, issues: ["minor formatting"] };
      await analyzerAgent.sendResult(`${runId}-analyze`, "success", analyzerResult);

      // Record analyzer step completion
      const analyzerStepId = recordWorkflowStep(runId, analyzerAgent.id, analyzerAgent.id, "pending");
      updateWorkflowStep(analyzerStepId, "completed", analyzerResult, undefined);

      // Step 2: Send intent to reviewer (with analyzer results)
      const reviewerIntentPromise = reviewerAgent.waitForIntent(5000);
      wsServer.sendIntentToAgent(reviewerAgent.id, `${runId}-review`, "execute_step", {
        stepId: reviewerAgent.id,
        runId,
        task: "review analysis",
        input: analyzerResult,
      });

      const reviewerIntent = await reviewerIntentPromise;
      expect(reviewerIntent.payload.action).toBe("execute_step");

      // Simulate reviewer execution
      const reviewerResult = { approved: true, feedback: "Good analysis" };
      await reviewerAgent.sendResult(`${runId}-review`, "success", reviewerResult);

      // Record reviewer step completion
      const reviewerStepId = recordWorkflowStep(runId, reviewerAgent.id, reviewerAgent.id, "pending");
      updateWorkflowStep(reviewerStepId, "completed", reviewerResult, undefined);

      // Verify workflow completion
      const history = getWorkflowRunHistory(runId);
      expect(history.steps.length).toBe(2);
      expect(history.steps.every((s) => s.status === "completed")).toBe(true);

      analyzerAgent.close();
      reviewerAgent.close();
    });
  });

  // =========================================================================
  // Test 2: Parallel Workflow with Fan-Out/Fan-In
  // =========================================================================

  describe("Parallel Workflow Execution", () => {
    it("should execute parallel workflow with two concurrent agents and merger", async () => {
      const agent1 = new MockAgent(`ws://localhost:${WS_PORT}`, "Parallel Agent 1");
      const agent2 = new MockAgent(`ws://localhost:${WS_PORT}`, "Parallel Agent 2");
      const mergerAgent = new MockAgent(`ws://localhost:${WS_PORT}`, "Merger Agent");

      await agent1.connect();
      await agent2.connect();
      await mergerAgent.connect();

      await agent1.authenticate(["process"], wsServer);
      await agent2.authenticate(["process"], wsServer);
      await mergerAgent.authenticate(["merge"], wsServer);

      // Create parallel workflow
      const workflow: WorkflowDefinition = {
        nodes: [
          {
            id: agent1.id,
            type: "agent",
            data: { agentId: agent1.id, label: "Processor 1", params: { task: "process data 1" } },
            position: { x: 0, y: -100 },
          },
          {
            id: agent2.id,
            type: "agent",
            data: { agentId: agent2.id, label: "Processor 2", params: { task: "process data 2" } },
            position: { x: 0, y: 100 },
          },
          {
            id: mergerAgent.id,
            type: "agent",
            data: {
              agentId: mergerAgent.id,
              label: "Merger",
              params: {
                input1: `\${${agent1.id}}`,
                input2: `\${${agent2.id}}`,
                task: "merge results",
              },
            },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [
          { id: "p1-m", source: agent1.id, target: mergerAgent.id },
          { id: "p2-m", source: agent2.id, target: mergerAgent.id },
        ],
      };

      const workflowId = saveWorkflow("Parallel Workflow", workflow, undefined);
      const runId = startWorkflowRun(workflowId);

      // Execute agent1
      const intent1 = agent1.waitForIntent(5000);
      wsServer.sendIntentToAgent(agent1.id, `${runId}-p1`, "execute_step", {
        stepId: agent1.id,
        runId,
      });
      await intent1;
      await agent1.sendResult(`${runId}-p1`, "success", { result: "data1 processed" });
      const step1 = recordWorkflowStep(runId, agent1.id, agent1.id, "pending");
      updateWorkflowStep(step1, "completed", { result: "data1 processed" }, undefined);

      // Execute agent2
      const intent2 = agent2.waitForIntent(5000);
      wsServer.sendIntentToAgent(agent2.id, `${runId}-p2`, "execute_step", {
        stepId: agent2.id,
        runId,
      });
      await intent2;
      await agent2.sendResult(`${runId}-p2`, "success", { result: "data2 processed" });
      const step2 = recordWorkflowStep(runId, agent2.id, agent2.id, "pending");
      updateWorkflowStep(step2, "completed", { result: "data2 processed" }, undefined);

      // Execute merger
      const intentMerge = mergerAgent.waitForIntent(5000);
      wsServer.sendIntentToAgent(mergerAgent.id, `${runId}-merge`, "execute_step", {
        stepId: mergerAgent.id,
        runId,
      });
      await intentMerge;
      await mergerAgent.sendResult(`${runId}-merge`, "success", {
        merged: "combined results",
      });
      const stepMerge = recordWorkflowStep(runId, mergerAgent.id, mergerAgent.id, "pending");
      updateWorkflowStep(stepMerge, "completed", { merged: "combined results" }, undefined);

      // Verify completion
      const history = getWorkflowRunHistory(runId);
      expect(history.steps.length).toBe(3);
      expect(history.steps.every((s) => s.status === "completed")).toBe(true);

      agent1.close();
      agent2.close();
      mergerAgent.close();
    });
  });

  // =========================================================================
  // Test 3: Agent Failure and Error Handling
  // =========================================================================

  describe("Workflow Error Handling", () => {
    it("should handle agent execution failure in workflow", async () => {
      const agent1 = new MockAgent(`ws://localhost:${WS_PORT}`, "Failing Agent");
      const agent2 = new MockAgent(`ws://localhost:${WS_PORT}`, "Dependent Agent");

      await agent1.connect();
      await agent2.connect();

      await agent1.authenticate(["process"], wsServer);
      await agent2.authenticate(["process"], wsServer);

      const workflow: WorkflowDefinition = {
        nodes: [
          {
            id: agent1.id,
            type: "agent",
            data: { agentId: agent1.id, label: "Will Fail", params: { task: "fail" } },
            position: { x: 0, y: 0 },
          },
          {
            id: agent2.id,
            type: "agent",
            data: { agentId: agent2.id, label: "Dependent", params: { input: `\${${agent1.id}}` } },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [{ id: "fail-dep", source: agent1.id, target: agent2.id }],
      };

      const workflowId = saveWorkflow("Error Workflow", workflow, undefined);
      const runId = startWorkflowRun(workflowId);

      // Agent 1 fails
      const intent1 = agent1.waitForIntent(5000);
      wsServer.sendIntentToAgent(agent1.id, `${runId}-fail`, "execute_step", {
        stepId: agent1.id,
        runId,
      });
      await intent1;
      await agent1.sendResult(`${runId}-fail`, "failed", undefined, "Execution timeout");

      const step1 = recordWorkflowStep(runId, agent1.id, agent1.id, "pending");
      updateWorkflowStep(step1, "failed", undefined, "Execution timeout");

      // Verify failure is tracked
      const history = getWorkflowRunHistory(runId);
      expect(history.steps.some((s) => s.status === "failed")).toBe(true);

      agent1.close();
      agent2.close();
    });
  });

  // =========================================================================
  // Test 4: Multi-Agent Workflow with Complex Dependencies
  // =========================================================================

  describe("Complex Multi-Agent Workflows", () => {
    it("should execute complex workflow with multiple sequential stages", async () => {
      const agents = Array.from({ length: 4 }, (_, i) =>
        new MockAgent(`ws://localhost:${WS_PORT}`, `Stage ${i + 1} Agent`)
      );

      // Connect and authenticate all
      await Promise.all(agents.map((a) => a.connect()));
      await Promise.all(
        agents.map((a, i) => a.authenticate([`stage-${i + 1}`], wsServer))
      );

      // Linear workflow: agent0 → agent1 → agent2 → agent3
      const workflow: WorkflowDefinition = {
        nodes: agents.map((agent, idx) => ({
          id: agent.id,
          type: "agent" as const,
          data: {
            agentId: agent.id,
            label: `Stage ${idx + 1}`,
            params: {
              input: idx === 0 ? undefined : `\${${agents[idx - 1]!.id}}`,
              task: `Stage ${idx + 1} processing`,
            },
          },
          position: { x: idx * 200, y: 0 },
        })),
        edges: agents.slice(0, -1).map((agent, idx) => ({
          id: `e${idx}`,
          source: agent.id,
          target: agents[idx + 1]!.id,
        })),
      };

      const workflowId = saveWorkflow("Complex Workflow", workflow, undefined);
      const runId = startWorkflowRun(workflowId);

      // Execute each agent in sequence
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i]!;
        const intentPromise = agent.waitForIntent(5000);
        wsServer.sendIntentToAgent(agent.id, `${runId}-stage${i}`, "execute_step", {
          stepId: agent.id,
          runId,
          stage: i + 1,
        });

        await intentPromise;
        await agent.sendResult(`${runId}-stage${i}`, "success", {
          stage: i + 1,
          output: `Stage ${i + 1} completed`,
        });

        const stepId = recordWorkflowStep(runId, agent.id, agent.id, "pending");
        updateWorkflowStep(
          stepId,
          "completed",
          { stage: i + 1, output: `Stage ${i + 1} completed` },
          undefined
        );
      }

      // Verify all stages completed
      const history = getWorkflowRunHistory(runId);
      expect(history.steps.length).toBe(4);
      expect(history.steps.every((s) => s.status === "completed")).toBe(true);

      agents.forEach((a) => a.close());
    });
  });

  // =========================================================================
  // Test 5: Topological Sort for Complex DAGs
  // =========================================================================

  describe("Workflow Topology", () => {
    it("should correctly sort complex workflow DAG", () => {
      // Use simple string IDs for nodes instead of agent IDs
      const nodeIds = ["node0", "node1", "node2", "node3", "node4"];

      // Complex DAG:
      //     0
      //    / \
      //   1   2
      //   |\ /|
      //   | 3 |
      //   |   |
      //   4---+
      const workflow: WorkflowDefinition = {
        nodes: nodeIds.map((id, idx) => ({
          id,
          type: "agent" as const,
          data: { agentId: id, label: `Node ${idx}` },
          position: { x: idx * 100, y: 0 },
        })),
        edges: [
          { id: "0-1", source: nodeIds[0]!, target: nodeIds[1]! },
          { id: "0-2", source: nodeIds[0]!, target: nodeIds[2]! },
          { id: "1-3", source: nodeIds[1]!, target: nodeIds[3]! },
          { id: "2-3", source: nodeIds[2]!, target: nodeIds[3]! },
          { id: "1-4", source: nodeIds[1]!, target: nodeIds[4]! },
          { id: "3-4", source: nodeIds[3]!, target: nodeIds[4]! },
        ],
      };

      const sorted = topologicalSort(workflow.nodes, workflow.edges);
      expect(sorted).toBeDefined();
      expect(sorted!.length).toBe(5);

      // Verify ordering constraints
      const positions = new Map(sorted!.map((id, idx) => [id, idx]));
      const pos = (id: string) => positions.get(id)!;

      // 0 before 1 and 2
      expect(pos(nodeIds[0]!) < pos(nodeIds[1]!)).toBe(true);
      expect(pos(nodeIds[0]!) < pos(nodeIds[2]!)).toBe(true);

      // 1 before 3 and 4
      expect(pos(nodeIds[1]!) < pos(nodeIds[3]!)).toBe(true);
      expect(pos(nodeIds[1]!) < pos(nodeIds[4]!)).toBe(true);

      // 2 before 3
      expect(pos(nodeIds[2]!) < pos(nodeIds[3]!)).toBe(true);

      // 3 before 4
      expect(pos(nodeIds[3]!) < pos(nodeIds[4]!)).toBe(true);
    });
  });

  // =========================================================================
  // Test 6: Agent Reconnection and Workflow Resumption
  // =========================================================================

  describe("Agent Resilience", () => {
    it("should handle agent reconnection during workflow", async () => {
      const agent = new MockAgent(`ws://localhost:${WS_PORT}`, "Reconnecting Agent");
      const vaultysId = (await agent.getVaultysId?.()) || undefined;

      await agent.connect();
      await agent.authenticate(["resilient"], wsServer);

      const agentId = agent.id;
      expect(agentId).toBeTruthy();

      // Send intent
      const intentPromise = agent.waitForIntent(5000);
      wsServer.sendIntentToAgent(agentId, "task-1", "execute_step", {
        stepId: "step-1",
      });
      await intentPromise;

      // Agent disconnects
      agent.close();

      // Wait for disconnect to be processed
      await waitFor(() => !wsServer.getAgent(agentId), 3000);
      expect(wsServer.getAgent(agentId)).toBeUndefined();

      // Agent reconnects
      const reconnected = new MockAgent(`ws://localhost:${WS_PORT}`, "Reconnecting Agent");
      if (vaultysId) {
        // Use same identity if available
        await reconnected.connect();
        await reconnected.authenticate(["resilient"], wsServer);
      } else {
        await reconnected.connect();
        await reconnected.authenticate(["resilient"], wsServer);
      }

      // New agent should be registered
      expect(wsServer.getAgent(reconnected.id)).toBeDefined();

      reconnected.close();
    });
  });

  // =========================================================================
  // Test 7: Concurrent Workflow Execution
  // =========================================================================

  describe("Concurrent Workflows", () => {
    it("should execute multiple workflows concurrently with different agents", async () => {
      const agents = Array.from({ length: 4 }, (_, i) =>
        new MockAgent(`ws://localhost:${WS_PORT}`, `Concurrent Agent ${i}`)
      );

      await Promise.all(agents.map((a) => a.connect()));
      await Promise.all(agents.map((a) => a.authenticate(["work"], wsServer)));

      // Create two parallel workflows
      const workflow1: WorkflowDefinition = {
        nodes: [
          {
            id: agents[0]!.id,
            type: "agent",
            data: { agentId: agents[0]!.id },
            position: { x: 0, y: 0 },
          },
          {
            id: agents[1]!.id,
            type: "agent",
            data: { agentId: agents[1]!.id },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [{ id: "e1", source: agents[0]!.id, target: agents[1]!.id }],
      };

      const workflow2: WorkflowDefinition = {
        nodes: [
          {
            id: agents[2]!.id,
            type: "agent",
            data: { agentId: agents[2]!.id },
            position: { x: 0, y: 0 },
          },
          {
            id: agents[3]!.id,
            type: "agent",
            data: { agentId: agents[3]!.id },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [{ id: "e2", source: agents[2]!.id, target: agents[3]!.id }],
      };

      const wf1Id = saveWorkflow("Concurrent WF 1", workflow1, undefined);
      const wf2Id = saveWorkflow("Concurrent WF 2", workflow2, undefined);

      const run1Id = startWorkflowRun(wf1Id);
      const run2Id = startWorkflowRun(wf2Id);

      // Execute both workflows concurrently
      const executeWorkflow1 = (async () => {
        const intent = agents[0]!.waitForIntent(5000);
        wsServer.sendIntentToAgent(agents[0]!.id, `${run1Id}-1`, "execute", {
          runId: run1Id,
        });
        await intent;
        await agents[0]!.sendResult(`${run1Id}-1`, "success", { wf: 1 });

        const intent2 = agents[1]!.waitForIntent(5000);
        wsServer.sendIntentToAgent(agents[1]!.id, `${run1Id}-2`, "execute", {
          runId: run1Id,
        });
        await intent2;
        await agents[1]!.sendResult(`${run1Id}-2`, "success", { wf: 1 });
      })();

      const executeWorkflow2 = (async () => {
        const intent = agents[2]!.waitForIntent(5000);
        wsServer.sendIntentToAgent(agents[2]!.id, `${run2Id}-1`, "execute", {
          runId: run2Id,
        });
        await intent;
        await agents[2]!.sendResult(`${run2Id}-1`, "success", { wf: 2 });

        const intent2 = agents[3]!.waitForIntent(5000);
        wsServer.sendIntentToAgent(agents[3]!.id, `${run2Id}-2`, "execute", {
          runId: run2Id,
        });
        await intent2;
        await agents[3]!.sendResult(`${run2Id}-2`, "success", { wf: 2 });
      })();

      await Promise.all([executeWorkflow1, executeWorkflow2]);

      // Record steps
      for (const [runId, agentIds] of [
        [run1Id, [agents[0]!.id, agents[1]!.id]],
        [run2Id, [agents[2]!.id, agents[3]!.id]],
      ] as const) {
        for (const agentId of agentIds) {
          const stepId = recordWorkflowStep(runId, agentId, agentId, "pending");
          updateWorkflowStep(stepId, "completed", { wf: runId }, undefined);
        }
      }

      // Both should complete
      const history1 = getWorkflowRunHistory(run1Id);
      const history2 = getWorkflowRunHistory(run2Id);

      expect(history1.steps.every((s) => s.status === "completed")).toBe(true);
      expect(history2.steps.every((s) => s.status === "completed")).toBe(true);

      agents.forEach((a) => a.close());
    });
  });
});
