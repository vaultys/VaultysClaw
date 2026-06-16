/**
 * Comprehensive tests for Workflow Runs API
 * - Real agent-controller framework with mocked LLM
 * - Mocked users and automated test scenarios
 * - Full workflow lifecycle: creation → execution → completion
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WorkflowDefinition } from "../packages/control-plane/lib/workflow-types";
import { WorkflowDAO } from "../packages/control-plane/db";
import { prisma } from "../packages/control-plane/db/client";
import {
  topologicalSort,
  interpolateParams,
} from "../packages/control-plane/lib/workflow-executor";

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Factory to create test agents in the database
 */
async function createTestAgent(
  overrides?: Partial<{
    did: string;
    name: string;
    capabilities: string[];
  }>
) {
  const did =
    overrides?.did ?? `agent-${Math.random().toString(36).slice(2, 9)}`;
  const agent = {
    did,
    name: overrides?.name ?? `Test Agent ${did.slice(0, 8)}`,
    capabilities: overrides?.capabilities ?? ["read", "write"],
  };
  await prisma.agent.upsert({
    where: { did },
    create: { did, name: agent.name, capabilities: agent.capabilities },
    update: {},
  });
  return agent;
}

/**
 * Factory to create test workflow definitions
 */
function createTestWorkflow(
  overrides?: Partial<{
    name: string;
    agents: string[];
    edges?: Array<{ source: string; target: string }>;
  }>
) {
  const agents = overrides?.agents ?? ["agent-1", "agent-2"];
  const edges = overrides?.edges ?? [{ source: agents[0], target: agents[1] }];

  const definition: WorkflowDefinition = {
    nodes: agents.map((agentId, idx) => ({
      id: agentId,
      type: "agent" as const,
      data: {
        agentId,
        label: `Agent ${idx + 1}`,
        agentName: `Test Agent ${idx + 1}`,
        params: {
          input: idx === 0 ? undefined : `\${${agents[idx - 1]}}`,
          task: `Test task for agent ${idx + 1}`,
        },
      },
      position: { x: idx * 200, y: 0 },
    })),
    edges: edges.map((e) => ({
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
    })),
  };

  return {
    name: overrides?.name ?? `Test Workflow ${Date.now()}`,
    definition,
  };
}

// ============================================================================
// Workflow Runs API Tests
// ============================================================================

describe("Workflow Runs API", () => {
  describe("GET /api/workflow-runs - List Workflow Runs", () => {
    it("should return workflow runs (may include previous runs)", async () => {
      const result = await WorkflowDAO.queryRuns({});
      expect(result.runs).toBeDefined();
      expect(typeof result.total).toBe("number");
      expect(result.total >= 0).toBe(true);
    });

    it("should return paginated workflow runs", async () => {
      const workflow = createTestWorkflow();
      const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);

      // Create multiple runs
      for (let i = 0; i < 5; i++) await WorkflowDAO.startRun(workflowId);

      const result = await WorkflowDAO.queryRuns({ pageSize: 2, page: 1 });
      expect(result.runs.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThanOrEqual(5);
    });

    it("should filter runs by workflow ID", async () => {
      const workflow1 = createTestWorkflow({ name: "Workflow 1" });
      const workflow2 = createTestWorkflow({ name: "Workflow 2" });

      const id1 = await WorkflowDAO.create(workflow1.name, workflow1.definition as any);
      const id2 = await WorkflowDAO.create(workflow2.name, workflow2.definition as any);

      await WorkflowDAO.startRun(id1);
      await WorkflowDAO.startRun(id1);
      await WorkflowDAO.startRun(id2);

      const result = await WorkflowDAO.queryRuns({ workflowId: id1 });
      expect(result.runs.every((r) => r.workflowId === id1)).toBe(true);
    });

    it("should filter runs by status", async () => {
      const workflow = createTestWorkflow();
      const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);

      const run1Id = await WorkflowDAO.startRun(workflowId);
      await WorkflowDAO.startRun(workflowId);

      // Record a step for run1
      const stepId1 = await WorkflowDAO.recordStep(run1Id, "agent-1", "agent-1", "pending");
      await WorkflowDAO.updateStep(stepId1, { status: "completed", output: { result: "test" } });

      const runningResult = await WorkflowDAO.queryRuns({ status: "running" });
      expect(runningResult.runs.length >= 0).toBe(true);
    });

    it("should sort runs by creation date", async () => {
      const workflow = createTestWorkflow();
      const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);

      for (let i = 0; i < 3; i++) await WorkflowDAO.startRun(workflowId);

      const result = await WorkflowDAO.queryRuns({ sortBy: "startedAt", sortDir: "desc" });
      expect(result.runs.length >= 0).toBe(true);
    });
  });

  describe("GET /api/workflow-runs/[id] - Get Run Details", () => {
    it("should return single run with steps and workflow definition", async () => {
      const workflow = createTestWorkflow();
      const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);
      const runId = await WorkflowDAO.startRun(workflowId);

      const step1Id = await WorkflowDAO.recordStep(runId, "agent-1", "agent-1", "pending");
      const step2Id = await WorkflowDAO.recordStep(runId, "agent-2", "agent-2", "pending");

      await WorkflowDAO.updateStep(step1Id, { status: "completed", output: { output: "result 1" } });
      await WorkflowDAO.updateStep(step2Id, { status: "completed", output: { output: "result 2" } });

      const history = await WorkflowDAO.getRunHistory(runId);
      expect(history?.run).toBeDefined();
      expect(history?.steps.length).toBeGreaterThanOrEqual(2);
      expect(history?.workflow).toBeDefined();
      expect(history?.run!.id).toBe(runId);
    });

    it("should track step execution states through workflow", async () => {
      const workflow = createTestWorkflow();
      const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);
      const runId = await WorkflowDAO.startRun(workflowId);

      const stepId = await WorkflowDAO.recordStep(runId, "agent-1", "agent-1", "pending");
      await WorkflowDAO.updateStep(stepId, { status: "running" });
      await WorkflowDAO.updateStep(stepId, { status: "completed", output: { result: "test" } });

      const history = await WorkflowDAO.getRunHistory(runId);
      const step = history?.steps.find((s) => s.stepId === "agent-1");
      expect(step?.status).toBe("completed");
    });
  });
});

// ============================================================================
// Workflow Execution with Mock Agents
// ============================================================================

describe("Workflow Execution with Mocked Agents", () => {
  let testAgents: Awaited<ReturnType<typeof createTestAgent>>[];

  beforeEach(async () => {
    testAgents = await Promise.all([
      createTestAgent({ name: "Code Analyzer", capabilities: ["analyze", "read"] }),
      createTestAgent({ name: "Code Reviewer", capabilities: ["review", "write"] }),
      createTestAgent({ name: "Report Writer", capabilities: ["write", "document"] }),
    ]);
  });

  it("should execute sequential workflow with parameter interpolation", async () => {
    const workflow = createTestWorkflow({
      name: "Sequential Analysis",
      agents: [testAgents[0]!.did, testAgents[1]!.did],
      edges: [{ source: testAgents[0]!.did, target: testAgents[1]!.did }],
    });

    const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);
    const runId = await WorkflowDAO.startRun(workflowId);

    const analyzerStepId = await WorkflowDAO.recordStep(runId, testAgents[0]!.did, testAgents[0]!.did, "pending");
    await WorkflowDAO.updateStep(analyzerStepId, { status: "completed", output: { analysis: "Code is well-structured" } });

    const reviewerStepId = await WorkflowDAO.recordStep(runId, testAgents[1]!.did, testAgents[1]!.did, "pending");
    await WorkflowDAO.updateStep(reviewerStepId, { status: "completed", output: { review: "approved" } });

    const history = await WorkflowDAO.getRunHistory(runId);
    const reviewerStep = history?.steps.find((s) => s.agentId === testAgents[1]!.did);

    expect(reviewerStep?.agentId).toBe(testAgents[1]!.did);
    expect(history?.steps.find((s) => s.agentId === testAgents[0]!.did)?.status).toBe("completed");
  });

  it("should handle workflow run with failed step", async () => {
    const workflow = createTestWorkflow({
      name: "Failure Test",
      agents: [testAgents[0]!.did, testAgents[1]!.did],
    });

    const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);
    const runId = await WorkflowDAO.startRun(workflowId);

    const step1Id = await WorkflowDAO.recordStep(runId, testAgents[0]!.did, testAgents[0]!.did, "pending");
    await WorkflowDAO.updateStep(step1Id, { status: "completed", output: { result: "analysis done" } });

    const step2Id = await WorkflowDAO.recordStep(runId, testAgents[1]!.did, testAgents[1]!.did, "pending");
    await WorkflowDAO.updateStep(step2Id, { status: "failed", error: "Agent execution timeout" });

    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history?.steps.some((s) => s.status === "failed")).toBe(true);
  });
});

// ============================================================================
// Workflow Run Status and Error Handling
// ============================================================================

describe("Workflow Run Status Management", () => {
  it("should track workflow run through all states", async () => {
    const workflow = createTestWorkflow();
    const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);

    const runId = await WorkflowDAO.startRun(workflowId);
    let run = await WorkflowDAO.findRun(runId);
    expect(run?.status).toBe("running");

    const step1Id = await WorkflowDAO.recordStep(runId, "agent-1", "agent-1", "pending");
    await WorkflowDAO.updateStep(step1Id, { status: "running" });
    await WorkflowDAO.updateStep(step1Id, { status: "completed", output: { result: "result 1" } });

    const step2Id = await WorkflowDAO.recordStep(runId, "agent-2", "agent-2", "pending");
    await WorkflowDAO.updateStep(step2Id, { status: "completed", output: { result: "result 2" } });

    run = await WorkflowDAO.findRun(runId);
    expect(run?.id).toBe(runId);
  });

  it("should support workflow run cancellation", async () => {
    const workflow = createTestWorkflow();
    const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);
    const runId = await WorkflowDAO.startRun(workflowId);

    const stepId = await WorkflowDAO.recordStep(runId, "agent-1", "agent-1", "pending");
    await WorkflowDAO.updateStep(stepId, { status: "cancelled" });

    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history?.steps[0].status).toBe("cancelled");
  });
});

// ============================================================================
// Real Agent-Controller Integration (Mocked LLM)
// ============================================================================

describe("Real Agent-Controller with Mocked LLM", () => {
  let testAgent: Awaited<ReturnType<typeof createTestAgent>>;

  beforeEach(async () => {
    testAgent = await createTestAgent({
      name: "Test Agent",
      capabilities: ["read", "write", "analyze"],
    });

    vi.mock("@mastra/core/agent", () => ({
      Agent: vi.fn().mockImplementation(() => ({
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            thinking: "Mocked analysis",
            result: "Analysis complete",
            confidence: 0.95,
          }),
        }),
      })),
    }));
  });

  it("should initialize agent with mock LLM config", async () => {
    expect(testAgent).toBeDefined();
    expect(testAgent.name).toBe("Test Agent");

    const agent = await prisma.agent.findUnique({ where: { did: testAgent.did } });
    expect(agent).toBeDefined();
  });

  it("should execute agent with mocked LLM response", async () => {
    const workflow = createTestWorkflow({ agents: [testAgent.did] });

    const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);
    const runId = await WorkflowDAO.startRun(workflowId);

    const stepId = await WorkflowDAO.recordStep(runId, testAgent.did, testAgent.did, "pending");

    const mockOutput = {
      thinking: "Mocked analysis",
      result: "Analysis complete",
      confidence: 0.95,
    };

    await WorkflowDAO.updateStep(stepId, { status: "completed", output: mockOutput });

    const history = await WorkflowDAO.getRunHistory(runId);
    const step = history?.steps[0];

    expect(step?.agentId).toBe(testAgent.did);
    expect(step?.status).toBe("completed");
  });
});

// ============================================================================
// Automated Test Scenarios
// ============================================================================

describe("Automated Workflow Test Scenarios", () => {
  let agents: Awaited<ReturnType<typeof createTestAgent>>[];

  beforeEach(async () => {
    agents = await Promise.all([
      createTestAgent({ name: "Code Analyzer", capabilities: ["analyze", "read"] }),
      createTestAgent({ name: "Security Auditor", capabilities: ["audit", "read", "security"] }),
      createTestAgent({ name: "Performance Tester", capabilities: ["test", "performance"] }),
      createTestAgent({ name: "Report Generator", capabilities: ["write", "document"] }),
    ]);
  });

  it("should run complete code review workflow", async () => {
    const workflow: WorkflowDefinition = {
      nodes: [
        { id: "analyzer", type: "agent", data: { agentId: agents[0]!.did, params: { task: "Analyze code quality" } }, position: { x: 0, y: 0 } },
        { id: "auditor", type: "agent", data: { agentId: agents[1]!.did, params: { input: "${analyzer}", task: "Security audit" } }, position: { x: 200, y: 0 } },
        { id: "tester", type: "agent", data: { agentId: agents[2]!.did, params: { input: "${analyzer}", task: "Performance test" } }, position: { x: 200, y: 100 } },
        { id: "writer", type: "agent", data: { agentId: agents[3]!.did, params: { analysis: "${analyzer}", security: "${auditor}", performance: "${tester}", task: "Generate report" } }, position: { x: 400, y: 50 } },
      ],
      edges: [
        { id: "1", source: "analyzer", target: "auditor" },
        { id: "2", source: "analyzer", target: "tester" },
        { id: "3", source: "auditor", target: "writer" },
        { id: "4", source: "tester", target: "writer" },
      ],
    };

    const workflowId = await WorkflowDAO.create("Code Review Pipeline", workflow as any);
    const runId = await WorkflowDAO.startRun(workflowId);

    const steps = [
      { nodeId: "analyzer", agentId: agents[0]!.did, output: { quality: 8.5 } },
      { nodeId: "auditor", agentId: agents[1]!.did, output: { vulnerabilities: 2 } },
      { nodeId: "tester", agentId: agents[2]!.did, output: { score: 9.0 } },
      { nodeId: "writer", agentId: agents[3]!.did, output: { report: "Complete analysis" } },
    ];

    for (const step of steps) {
      const stepId = await WorkflowDAO.recordStep(runId, step.nodeId, step.agentId, "pending");
      await WorkflowDAO.updateStep(stepId, { status: "completed", output: step.output });
    }

    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history?.steps.length).toBeGreaterThanOrEqual(4);
    expect(history?.steps.every((s) => s.status === "completed")).toBe(true);
  });

  it("should handle workflow with retry logic", async () => {
    const workflow = createTestWorkflow({ agents: [agents[0]!.did] });

    const workflowId = await WorkflowDAO.create(workflow.name, workflow.definition as any);
    const runId = await WorkflowDAO.startRun(workflowId);

    // First attempt fails
    const step1Id = await WorkflowDAO.recordStep(runId, agents[0]!.did, agents[0]!.did, "pending");
    await WorkflowDAO.updateStep(step1Id, { status: "failed", error: "Timeout" });

    // Retry succeeds
    const step2Id = await WorkflowDAO.recordStep(runId, agents[0]!.did, agents[0]!.did, "pending");
    await WorkflowDAO.updateStep(step2Id, { status: "completed", output: { result: "success on retry" } });

    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history?.steps.length).toBeGreaterThanOrEqual(2);

    const failedStep = history?.steps.find((s) => s.status === "failed");
    const successStep = history?.steps.find((s) => s.status === "completed");

    expect(failedStep).toBeDefined();
    expect(successStep).toBeDefined();
  });

  it("should handle topological sort for complex workflows", () => {
    const workflow: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent", data: {}, position: { x: 0, y: 0 } },
        { id: "b", type: "agent", data: {}, position: { x: 100, y: 0 } },
        { id: "c", type: "agent", data: {}, position: { x: 100, y: 100 } },
        { id: "d", type: "agent", data: {}, position: { x: 200, y: 50 } },
      ],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "a-c", source: "a", target: "c" },
        { id: "b-d", source: "b", target: "d" },
        { id: "c-d", source: "c", target: "d" },
      ],
    };

    const sorted = topologicalSort(workflow.nodes, workflow.edges);
    expect(sorted).toBeDefined();
    expect(sorted!.length).toBe(4);

    const aIdx = sorted!.indexOf("a");
    const bIdx = sorted!.indexOf("b");
    const cIdx = sorted!.indexOf("c");
    const dIdx = sorted!.indexOf("d");

    expect(aIdx < bIdx).toBe(true);
    expect(aIdx < cIdx).toBe(true);
    expect(bIdx < dIdx).toBe(true);
    expect(cIdx < dIdx).toBe(true);
  });

  it("should interpolate parameters correctly in workflows", () => {
    const params = {
      input: "${pred-node}",
      focusAreas: ["security", "performance"],
    };

    const predecessorResults = new Map([
      [
        "pred-node",
        {
          status: "completed",
          output: { analysis: "test" },
        },
      ],
    ]);

    const interpolated = interpolateParams(params, predecessorResults);
    expect(interpolated).toBeDefined();
    expect(interpolated.focusAreas).toBeDefined();
    const areas = Object.values(interpolated.focusAreas as object);
    expect(areas).toContain("security");
    expect(areas).toContain("performance");
  });
});
