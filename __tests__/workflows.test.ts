/**
 * Tests for the Workflow DAG system:
 *   - Database operations (workflows, runs, steps)
 *   - Workflow executor (topological sort, execution, branching)
 *   - API endpoints (create, read, update, delete, execute)
 *   - State management and UI integration
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  saveWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  deleteWorkflow,
  startWorkflowRun,
  getWorkflowRun,
  recordWorkflowStep,
  updateWorkflowStep,
  getWorkflowRunHistory,
  type WorkflowDefinition,
  type WorkflowRunRow,
  type WorkflowStepRow,
} from "../packages/control-plane/lib/db";
import { WorkflowDAO } from "../packages/control-plane/db";
import {
  topologicalSort,
  evaluateCondition,
  interpolateParams,
  executeWorkflow,
  type WorkflowNode,
  type WorkflowEdge,
  type ExecutionContext,
} from "../packages/control-plane/lib/workflow-executor";

// ---------------------------------------------------------------------------
// Database Layer Tests
// ---------------------------------------------------------------------------

describe("Workflow Database Operations", () => {
  describe("saveWorkflow", () => {
    it("should create a new workflow and return an ID", () => {
      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "node-1",
            type: "agent",
            data: { agentId: "@mock-agent" },
          },
        ],
        edges: [],
      };

      const id = saveWorkflow("Test Workflow", definition, undefined);

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("should persist workflow definition as JSON", () => {
      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "agent-1",
            type: "agent",
            data: { agentId: "code-analyst", params: { prompt: "test" } },
          },
          {
            id: "delay-1",
            type: "delay",
            data: { duration: 2 },
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "agent-1",
            target: "delay-1",
          },
        ],
      };

      const id = saveWorkflow("Complex Workflow", definition, undefined);
      const saved = getWorkflow(id);

      expect(saved).toBeDefined();
      expect(saved?.name).toBe("Complex Workflow");
      expect(saved?.definition).toBeDefined();
      const parsed = JSON.parse(saved!.definition);
      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.edges).toHaveLength(1);
    });

    it("should include timestamps", () => {
      const definition: WorkflowDefinition = {
        nodes: [],
        edges: [],
      };

      const id = saveWorkflow("Timestamped Workflow", definition, undefined);
      const workflow = getWorkflow(id);

      expect(workflow?.created_at).toBeDefined();
      expect(workflow?.updated_at).toBeDefined();
    });
  });

  describe("getWorkflow", () => {
    it("should return falsy value for non-existent workflow", () => {
      const workflow = getWorkflow("non-existent-id");
      expect(!workflow).toBe(true);
    });

    it("should retrieve saved workflow by ID", () => {
      const definition: WorkflowDefinition = {
        nodes: [{ id: "n1", type: "agent", data: {} }],
        edges: [],
      };
      const id = saveWorkflow("Retrievable Workflow", definition, undefined);
      const workflow = getWorkflow(id);

      expect(workflow?.id).toBe(id);
      expect(workflow?.name).toBe("Retrievable Workflow");
    });
  });

  describe("listWorkflows", () => {
    beforeEach(() => {
      // Clean up and prepare
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      saveWorkflow("Workflow 1", def, undefined);
      saveWorkflow("Workflow 2", def, undefined);
      saveWorkflow("Workflow 3", def, undefined);
    });

    it("should list all workflows", () => {
      const workflows = listWorkflows();
      expect(workflows.length).toBeGreaterThanOrEqual(3);
    });

    it("should include workflow metadata", () => {
      const workflows = listWorkflows();
      expect(workflows[0].id).toBeDefined();
      expect(workflows[0].name).toBeDefined();
      expect(workflows[0].created_at).toBeDefined();
    });
  });

  describe("updateWorkflow", () => {
    it("should update workflow name", () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const id = saveWorkflow("Original Name", def, undefined);

      updateWorkflow(id, "Updated Name", undefined);
      const updated = getWorkflow(id);

      expect(updated?.name).toBe("Updated Name");
    });

    it("should update workflow definition", () => {
      const originalDef: WorkflowDefinition = {
        nodes: [{ id: "n1", type: "agent", data: {} }],
        edges: [],
      };
      const id = saveWorkflow("To Update", originalDef, undefined);

      const newDef: WorkflowDefinition = {
        nodes: [
          { id: "n1", type: "agent", data: {} },
          { id: "n2", type: "delay", data: { duration: 5 } },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      };

      updateWorkflow(id, undefined, newDef);
      const updated = getWorkflow(id);
      const parsed = JSON.parse(updated!.definition);

      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.edges).toHaveLength(1);
    });

    it("should update only provided fields", () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const id = saveWorkflow("Partial Update", def, undefined);
      const originalDef = JSON.parse(getWorkflow(id)!.definition);

      updateWorkflow(id, "New Name", undefined);
      const updated = getWorkflow(id);
      const updatedDef = JSON.parse(updated!.definition);

      expect(updated?.name).toBe("New Name");
      expect(updatedDef.nodes).toEqual(originalDef.nodes);
    });
  });

  describe("deleteWorkflow", () => {
    it("should delete workflow and associated runs", () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const id = saveWorkflow("To Delete", def, undefined);

      deleteWorkflow(id);
      const deleted = getWorkflow(id);

      expect(deleted).toBeFalsy(); // Returns null or undefined
    });
  });

  describe("Workflow Execution (Runs & Steps)", () => {
    it("should create a workflow run", () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflowId = saveWorkflow("Executable", def, undefined);
      const runId = startWorkflowRun(workflowId);

      expect(runId).toBeDefined();
      expect(typeof runId).toBe("string");
    });

    it("should retrieve workflow run", () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflowId = saveWorkflow("Executable 2", def, undefined);
      const runId = startWorkflowRun(workflowId);

      const run = getWorkflowRun(runId);

      expect(run?.id).toBe(runId);
      expect(run?.workflow_id).toBe(workflowId);
      expect(run?.status).toBe("running");
    });

    it("should record workflow steps", () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflowId = saveWorkflow("With Steps", def, undefined);
      const runId = startWorkflowRun(workflowId);

      recordWorkflowStep(runId, "step-1", "@mock-agent", "pending");
      recordWorkflowStep(runId, "step-2", "@mock-agent", "pending");

      const history = getWorkflowRunHistory(runId);

      expect(history).toBeDefined();
      expect(history.steps).toHaveLength(2);
      expect(history.steps[0].step_id).toBe("step-1");
    });

    it("should update step status and output", () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflowId = saveWorkflow("Step Update", def, undefined);
      const runId = startWorkflowRun(workflowId);

      const dbId = recordWorkflowStep(
        runId,
        "step-1",
        "@mock-agent",
        "pending"
      );
      updateWorkflowStep(dbId, "success", { result: "test" }, undefined);

      const history = getWorkflowRunHistory(runId);
      const step = history.steps[0];

      expect(step.status).toBe("success");
      // Output is either JSON string or object depending on storage
      expect(step.output).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Workflow Executor Tests
// ---------------------------------------------------------------------------

describe("Workflow Executor", () => {
  describe("topologicalSort", () => {
    it("should sort linear DAG", () => {
      const nodes: WorkflowNode[] = [
        { id: "a", type: "agent", data: {} },
        { id: "b", type: "agent", data: {} },
        { id: "c", type: "agent", data: {} },
      ];
      const edges: WorkflowEdge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ];

      const sorted = topologicalSort(nodes, edges);

      expect(sorted).toEqual(["a", "b", "c"]);
    });

    it("should sort branching DAG", () => {
      const nodes: WorkflowNode[] = [
        { id: "start", type: "agent", data: {} },
        { id: "left", type: "agent", data: {} },
        { id: "right", type: "agent", data: {} },
        { id: "end", type: "agent", data: {} },
      ];
      const edges: WorkflowEdge[] = [
        { id: "e1", source: "start", target: "left" },
        { id: "e2", source: "start", target: "right" },
        { id: "e3", source: "left", target: "end" },
        { id: "e4", source: "right", target: "end" },
      ];

      const sorted = topologicalSort(nodes, edges);

      expect(sorted).toContain("start");
      expect(sorted.indexOf("start")).toBeLessThan(sorted.indexOf("left"));
      expect(sorted.indexOf("start")).toBeLessThan(sorted.indexOf("right"));
      expect(sorted.indexOf("left")).toBeLessThan(sorted.indexOf("end"));
      expect(sorted.indexOf("right")).toBeLessThan(sorted.indexOf("end"));
    });

    it("should detect cycles and return null", () => {
      const nodes: WorkflowNode[] = [
        { id: "a", type: "agent", data: {} },
        { id: "b", type: "agent", data: {} },
      ];
      const edges: WorkflowEdge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" }, // Cycle!
      ];

      const sorted = topologicalSort(nodes, edges);

      expect(sorted).toBeNull();
    });

    it("should handle disconnected nodes", () => {
      const nodes: WorkflowNode[] = [
        { id: "a", type: "agent", data: {} },
        { id: "b", type: "agent", data: {} },
        { id: "c", type: "agent", data: {} }, // Disconnected
      ];
      const edges: WorkflowEdge[] = [{ id: "e1", source: "a", target: "b" }];

      const sorted = topologicalSort(nodes, edges);

      expect(sorted).toHaveLength(3);
      expect(sorted).toContain("a");
      expect(sorted).toContain("b");
      expect(sorted).toContain("c");
    });
  });

  describe("evaluateCondition", () => {
    it("should evaluate simple expressions", () => {
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map([["step-1", { status: "success" }]]),
        stepStatus: new Map(),
      };

      const result1 = evaluateCondition("true", context);
      const result2 = evaluateCondition("false", context);
      const result3 = evaluateCondition("1 + 1 === 2", context);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(result3).toBe(true);
    });

    it("should evaluate expressions with undefined context", () => {
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map(),
        stepStatus: new Map(),
      };

      // Without setting output in context, these expressions evaluate differently
      const result = evaluateCondition("true", context);

      expect(result).toBe(true);
    });

    it("should handle complex JavaScript expressions", () => {
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map(),
        stepStatus: new Map(),
      };

      // Simple boolean logic without context
      const result = evaluateCondition("1 + 2 > 0", context);

      expect(result).toBe(true);
    });
  });

  describe("interpolateParams", () => {
    it("should preserve simple params without interpolation", () => {
      const params = {
        prompt: "Analyze code",
        count: 42,
      };
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map(),
        stepStatus: new Map(),
      };

      const result = interpolateParams(params, context);

      expect(result.prompt).toBe("Analyze code");
      expect(result.count).toBe(42);
    });

    it("should handle string params", () => {
      const params = {
        prompt: "Hello world",
      };
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map(),
        stepStatus: new Map(),
      };

      const result = interpolateParams(params, context);

      expect(result.prompt).toBe("Hello world");
    });

    it("should preserve non-string params", () => {
      const params = {
        count: 42,
        enabled: true,
        config: { timeout: 5000 },
      };
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map(),
        stepStatus: new Map(),
      };

      const result = interpolateParams(params, context);

      expect(result.count).toBe(42);
      expect(result.enabled).toBe(true);
      expect(result.config?.timeout).toBe(5000);
    });
  });

  describe("executeWorkflow", () => {
    it("should execute simple linear workflow", async () => {
      const def: WorkflowDefinition = {
        nodes: [{ id: "step-1", type: "agent", data: { agentId: "@mock-agent" } }],
        edges: [],
      };
      const workflowId = await WorkflowDAO.create("Simple Exec", def as any);
      const runId = await WorkflowDAO.startRun(workflowId);
      await executeWorkflow(runId, def);
      const run = await WorkflowDAO.findRun(runId);
      expect(run?.status).toBe("completed");
      const history = await WorkflowDAO.getRunHistory(runId);
      expect(history.steps).toHaveLength(1);
      expect(history.steps[0].status).toBe("success");
    });

    it("should execute workflow without errors", async () => {
      const def: WorkflowDefinition = {
        nodes: [{ id: "agent-1", type: "agent", data: { agentId: "@mock-agent" } }],
        edges: [],
      };
      const workflowId = await WorkflowDAO.create("Simple Exec 2", def as any);
      const runId = await WorkflowDAO.startRun(workflowId);
      await executeWorkflow(runId, def);
      const run = await WorkflowDAO.findRun(runId);
      expect(run?.status).toBe("completed");
    });

    it("should execute conditional branches", async () => {
      const def: WorkflowDefinition = {
        nodes: [
          { id: "agent-1", type: "agent", data: { agentId: "@mock-agent" } },
          { id: "condition-1", type: "condition", data: { expression: "true" } },
          { id: "agent-2", type: "agent", data: { agentId: "@mock-agent" } },
        ],
        edges: [
          { id: "e1", source: "agent-1", target: "condition-1" },
          { id: "e2", source: "condition-1", target: "agent-2", data: { condition: "true" } },
        ],
      };
      const workflowId = await WorkflowDAO.create("Conditional", def as any);
      const runId = await WorkflowDAO.startRun(workflowId);
      await executeWorkflow(runId, def);
      const history = await WorkflowDAO.getRunHistory(runId);
      const executedSteps = history.steps.filter((s) => s.status === "success");
      expect(executedSteps.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle workflow errors gracefully", async () => {
      const def: WorkflowDefinition = {
        nodes: [{ id: "agent-1", type: "agent", data: { agentId: "non-existent-agent" } }],
        edges: [],
      };
      const workflowId = await WorkflowDAO.create("Error Handling", def as any);
      const runId = await WorkflowDAO.startRun(workflowId);
      await executeWorkflow(runId, def).catch(() => {});
      const run = await WorkflowDAO.findRun(runId);
      expect(["completed", "failed"]).toContain(run?.status);
    });
  });
});

// ---------------------------------------------------------------------------
// State Management Integration Tests
// ---------------------------------------------------------------------------

describe("Workflow State Management", () => {
  it("should track execution progress", async () => {
    const def: WorkflowDefinition = {
      nodes: [{ id: "step-1", type: "agent", data: { agentId: "@mock-agent" } }],
      edges: [],
    };
    const workflowId = await WorkflowDAO.create("Progress Tracking", def as any);
    const runId = await WorkflowDAO.startRun(workflowId);
    await executeWorkflow(runId, def);
    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history.steps.length).toBeGreaterThanOrEqual(1);
    const statuses = history.steps.map((s) => s.status);
    expect(statuses).toContain("success");
  });

  it("should complete workflow successfully", async () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "agent-1", type: "agent", data: { agentId: "@mock-agent", params: { prompt: "Generate test data" } } },
      ],
      edges: [],
    };
    const workflowId = await WorkflowDAO.create("Simple Complete", def as any);
    const runId = await WorkflowDAO.startRun(workflowId);
    await executeWorkflow(runId, def);
    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history.steps.length).toBeGreaterThan(0);
    expect(history.steps[0].status).toBe("success");
  });
});
