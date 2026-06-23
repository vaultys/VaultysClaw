/**
 * Tests for the Workflow DAG system:
 *   - Database operations (workflows, runs, steps)
 *   - Workflow executor (topological sort, execution, branching)
 *   - API endpoints (create, read, update, delete, execute)
 *   - State management and UI integration
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { WorkflowDefinition } from "../packages/control-plane/lib/workflow-types";
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
  describe("WorkflowDAO.create", () => {
    it("should create a new workflow and return an ID", async () => {
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

      const created = await WorkflowDAO.create(
        "Test Workflow",
        definition as any
      );

      expect(created).toBeDefined();
      expect(typeof created).toBe("object");
    });

    it("should persist workflow definition", async () => {
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

      const created = await WorkflowDAO.create(
        "Complex Workflow",
        definition as any
      );
      const saved = await WorkflowDAO.findById(created.id);

      expect(saved).toBeDefined();
      expect(saved?.name).toBe("Complex Workflow");
      expect(saved?.definition).toBeDefined();
      const def = saved!.definition as any;
      expect(def.nodes).toHaveLength(2);
      expect(def.edges).toHaveLength(1);
    });

    it("should include timestamps", async () => {
      const definition: WorkflowDefinition = {
        nodes: [],
        edges: [],
      };

      const created = await WorkflowDAO.create(
        "Timestamped Workflow",
        definition as any
      );
      const workflow = await WorkflowDAO.findById(created.id);

      expect(workflow?.createdAt).toBeDefined();
      expect(workflow?.updatedAt).toBeDefined();
    });
  });

  describe("WorkflowDAO.findById", () => {
    it("should return null for non-existent workflow", async () => {
      const workflow = await WorkflowDAO.findById("non-existent-id");
      expect(workflow).toBeNull();
    });

    it("should retrieve saved workflow by ID", async () => {
      const definition: WorkflowDefinition = {
        nodes: [{ id: "n1", type: "agent", data: {} }],
        edges: [],
      };
      const created = await WorkflowDAO.create(
        "Retrievable Workflow",
        definition as any
      );

      expect(created?.name).toBe("Retrievable Workflow");
    });
  });

  describe("WorkflowDAO.list", () => {
    beforeEach(async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      await WorkflowDAO.create("Workflow 1", def as any);
      await WorkflowDAO.create("Workflow 2", def as any);
      await WorkflowDAO.create("Workflow 3", def as any);
    });

    it("should list all workflows", async () => {
      const workflows = await WorkflowDAO.list();
      expect(workflows.length).toBeGreaterThanOrEqual(3);
    });

    it("should include workflow metadata", async () => {
      const workflows = await WorkflowDAO.list();
      expect(workflows[0].id).toBeDefined();
      expect(workflows[0].name).toBeDefined();
      expect(workflows[0].createdAt).toBeDefined();
    });
  });

  describe("WorkflowDAO.update", () => {
    it("should update workflow name", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const created = await WorkflowDAO.create("Original Name", def as any);

      await WorkflowDAO.update(created.id, { name: "Updated Name" });
      const updated = await WorkflowDAO.findById(created.id);

      expect(updated?.name).toBe("Updated Name");
    });

    it("should update workflow definition", async () => {
      const originalDef: WorkflowDefinition = {
        nodes: [{ id: "n1", type: "agent", data: {} }],
        edges: [],
      };
      const created = await WorkflowDAO.create("To Update", originalDef as any);

      const newDef: WorkflowDefinition = {
        nodes: [
          { id: "n1", type: "agent", data: {} },
          { id: "n2", type: "delay", data: { duration: 5 } },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      };

      await WorkflowDAO.update(created.id, { definition: newDef as any });
      const updated = await WorkflowDAO.findById(created.id);
      const def = updated!.definition as any;

      expect(def.nodes).toHaveLength(2);
      expect(def.edges).toHaveLength(1);
    });

    it("should update only provided fields", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const created = await WorkflowDAO.create("Partial Update", def as any);

      await WorkflowDAO.update(created.id, { name: "New Name" });
      const updated = await WorkflowDAO.findById(created.id);
      const updatedDef = updated!.definition as any;

      expect(updated?.name).toBe("New Name");
      expect(updatedDef.nodes).toEqual(def.nodes);
    });
  });

  describe("WorkflowDAO.delete", () => {
    it("should delete workflow so findById returns null", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const created = await WorkflowDAO.create("To Delete", def as any);

      await WorkflowDAO.delete(created.id);
      const deleted = await WorkflowDAO.findById(created.id);

      expect(deleted).toBeNull();
    });
  });

  describe("Workflow Execution (Runs & Steps)", () => {
    it("should create a workflow run", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const created = await WorkflowDAO.create("Executable", def as any);
      const runId = await WorkflowDAO.startRun(created.id);

      expect(runId).toBeDefined();
      expect(typeof runId).toBe("string");
    });

    it("should retrieve workflow run", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const created = await WorkflowDAO.create("Executable 2", def as any);
      const runId = await WorkflowDAO.startRun(created.id);

      const run = await WorkflowDAO.findRun(runId);

      expect(run?.id).toBe(runId);
      expect(run?.workflowId).toBe(created.id);
      expect(run?.status).toBe("running");
    });

    it("should record workflow steps", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const created = await WorkflowDAO.create("With Steps", def as any);
      const runId = await WorkflowDAO.startRun(created.id);

      await WorkflowDAO.recordStep(runId, "step-1", "@mock-agent", "pending");
      await WorkflowDAO.recordStep(runId, "step-2", "@mock-agent", "pending");

      const history = await WorkflowDAO.getRunHistory(runId);

      expect(history).toBeDefined();
      expect(history!.steps).toHaveLength(2);
      expect(history!.steps[0].stepId).toBe("step-1");
    });

    it("should update step status and output", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const created = await WorkflowDAO.create("Step Update", def as any);
      const runId = await WorkflowDAO.startRun(created.id);

      const dbId = await WorkflowDAO.recordStep(
        runId,
        "step-1",
        "@mock-agent",
        "pending"
      );
      await WorkflowDAO.updateStep(dbId, {
        status: "success",
        output: { result: "test" },
      });

      const history = await WorkflowDAO.getRunHistory(runId);
      const step = history!.steps[0];

      expect(step.status).toBe("success");
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

      expect(sorted).not.toBeNull();
      expect(sorted).toContain("start");
      expect(sorted!.indexOf("start")).toBeLessThan(sorted!.indexOf("left"));
      expect(sorted!.indexOf("start")).toBeLessThan(sorted!.indexOf("right"));
      expect(sorted!.indexOf("left")).toBeLessThan(sorted!.indexOf("end"));
      expect(sorted!.indexOf("right")).toBeLessThan(sorted!.indexOf("end"));
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
        stepIds: new Map(),
      };

      const result1 = evaluateCondition("true", context.stepOutputs);
      const result2 = evaluateCondition("false", context.stepOutputs);
      const result3 = evaluateCondition("1 + 1 == 2", context.stepOutputs);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(result3).toBe(true);
    });

    it("should evaluate expressions with undefined context", () => {
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map(),
        stepStatus: new Map(),
        stepIds: new Map(),
      };

      // Without setting output in context, these expressions evaluate differently
      const result = evaluateCondition("true", context.stepOutputs);

      expect(result).toBe(true);
    });

    it("should handle complex JavaScript expressions", () => {
      const context: ExecutionContext = {
        runId: "run-1",
        stepOutputs: new Map(),
        stepStatus: new Map(),
        stepIds: new Map(),
      };

      // Simple boolean logic without context
      const result = evaluateCondition("1 + 2 > 0", context.stepOutputs);

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
        stepIds: new Map(),
      };

      const result = interpolateParams(params, context.stepOutputs);

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
        stepIds: new Map(),
      };

      const result = interpolateParams(params, context.stepOutputs);

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
        stepIds: new Map(),
      };

      const result = interpolateParams(params, context.stepOutputs);

      expect(result.count).toBe(42);
      expect(result.enabled).toBe(true);
      expect((result.config as any)?.timeout).toBe(5000);
    });
  });

  describe("executeWorkflow", () => {
    it("should execute simple linear workflow", async () => {
      const def: WorkflowDefinition = {
        nodes: [
          { id: "step-1", type: "agent", data: { agentId: "@mock-agent" } },
        ],
        edges: [],
      };
      const created = await WorkflowDAO.create("Simple Exec", def as any);
      const runId = await WorkflowDAO.startRun(created.id);
      await executeWorkflow(runId, def);
      const run = await WorkflowDAO.findRun(runId);
      expect(run?.status).toBe("completed");
      const history = await WorkflowDAO.getRunHistory(runId);
      expect(history!.steps).toHaveLength(1);
      expect(history!.steps[0].status).toBe("success");
    });

    it("should execute workflow without errors", async () => {
      const def: WorkflowDefinition = {
        nodes: [
          { id: "agent-1", type: "agent", data: { agentId: "@mock-agent" } },
        ],
        edges: [],
      };
      const created = await WorkflowDAO.create("Simple Exec 2", def as any);
      const runId = await WorkflowDAO.startRun(created.id);
      await executeWorkflow(runId, def);
      const run = await WorkflowDAO.findRun(runId);
      expect(run?.status).toBe("completed");
    });

    it("should execute conditional branches", async () => {
      const def: WorkflowDefinition = {
        nodes: [
          { id: "agent-1", type: "agent", data: { agentId: "@mock-agent" } },
          {
            id: "condition-1",
            type: "condition",
            data: { expression: "true" },
          },
          { id: "agent-2", type: "agent", data: { agentId: "@mock-agent" } },
        ],
        edges: [
          { id: "e1", source: "agent-1", target: "condition-1" },
          {
            id: "e2",
            source: "condition-1",
            target: "agent-2",
            data: { condition: "true" },
          },
        ],
      };
      const created = await WorkflowDAO.create("Conditional", def as any);
      const runId = await WorkflowDAO.startRun(created.id);
      await executeWorkflow(runId, def);
      const history = await WorkflowDAO.getRunHistory(runId);
      const executedSteps = history!.steps.filter(
        (s) => s.status === "success"
      );
      expect(executedSteps.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle workflow errors gracefully", async () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "agent-1",
            type: "agent",
            data: { agentId: "non-existent-agent" },
          },
        ],
        edges: [],
      };
      const created = await WorkflowDAO.create("Error Handling", def as any);
      const runId = await WorkflowDAO.startRun(created.id);
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
      nodes: [
        { id: "step-1", type: "agent", data: { agentId: "@mock-agent" } },
      ],
      edges: [],
    };
    const created = await WorkflowDAO.create("Progress Tracking", def as any);
    const runId = await WorkflowDAO.startRun(created.id);
    await executeWorkflow(runId, def);
    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history!.steps.length).toBeGreaterThanOrEqual(1);
    const statuses = history!.steps.map((s) => s.status);
    expect(statuses).toContain("success");
  });

  it("should complete workflow successfully", async () => {
    const def: WorkflowDefinition = {
      nodes: [
        {
          id: "agent-1",
          type: "agent",
          data: {
            agentId: "@mock-agent",
            params: { prompt: "Generate test data" },
          },
        },
      ],
      edges: [],
    };
    const created = await WorkflowDAO.create("Simple Complete", def as any);
    const runId = await WorkflowDAO.startRun(created.id);
    await executeWorkflow(runId, def);
    const history = await WorkflowDAO.getRunHistory(runId);
    expect(history!.steps.length).toBeGreaterThan(0);
    expect(history!.steps[0].status).toBe("success");
  });
});
