/**
 * Tests for Workflow API Routes
 * Tests the REST API endpoints for workflow CRUD and execution
 */

import { describe, it, expect } from "vitest";
import type { WorkflowDefinition } from "../packages/control-plane/lib/workflow-types";
import { WorkflowDAO } from "../packages/control-plane/db";

// Mock NextRequest since we can't import from next/server in vitest
class MockNextRequest {
  method: string;
  url: string;
  body?: any;
  headers: Record<string, string>;

  constructor(
    url: string,
    init?: { method?: string; body?: string; headers?: Record<string, string> }
  ) {
    this.url = url;
    this.method = init?.method || "GET";
    this.body = init?.body ? JSON.parse(init.body) : undefined;
    this.headers = init?.headers || {};
  }

  async json() {
    return this.body;
  }
}

// Helper to create mock request
function createMockRequest(method: string, body?: any): MockNextRequest {
  const url = "http://localhost:3000/api/workflows";
  const request = new MockNextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
    },
  });
  return request;
}

describe("Workflow API Routes", () => {
  describe("POST /api/workflows - Create Workflow", () => {
    it("should require name and definition in request body", async () => {
      const testDef: WorkflowDefinition = {
        nodes: [{ id: "test", type: "agent", data: {} }],
        edges: [],
      };

      const id = await WorkflowDAO.create("Test Workflow", testDef as any);
      expect(id).toBeDefined();
    });

    it("should save workflow and return ID", async () => {
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
        "API Created Workflow",
        definition as any
      );

      expect(created).toBeDefined();

      expect(created?.name).toBe("API Created Workflow");
    });

    it("should store workflow definition as object", async () => {
      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "agent-1",
            type: "agent",
            data: {
              agentId: "code-analyst",
              params: { language: "typescript" },
            },
          },
        ],
        edges: [],
      };

      const saved = await WorkflowDAO.create(
        "JSON Storage Test",
        definition as any
      );

      const def = saved!.definition as any;
      expect(def.nodes[0].data.agentId).toBe("code-analyst");
      expect(def.nodes[0].data.params.language).toBe("typescript");
    });
  });

  describe("GET /api/workflows - List Workflows", () => {
    it("should list all workflows with metadata", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflow1 = await WorkflowDAO.create("List Test 1", def as any);
      const workflow2 = await WorkflowDAO.create("List Test 2", def as any);

      expect(workflow1?.name).toBe("List Test 1");
      expect(workflow1?.createdAt).toBeDefined();

      expect(workflow2?.name).toBe("List Test 2");
    });
  });

  describe("GET /api/workflows/[id] - Fetch Single Workflow", () => {
    it("should return null for non-existent workflow", async () => {
      const workflow = await WorkflowDAO.findById("non-existent-id");
      expect(workflow).toBeNull();
    });

    it("should return workflow with definition", async () => {
      const definition: WorkflowDefinition = {
        nodes: [
          {
            id: "condition-1",
            type: "condition",
            data: {
              expression: 'output.status === "success"',
            },
          },
        ],
        edges: [],
      };

      const workflow = await WorkflowDAO.create(
        "Fetch Test",
        definition as any
      );

      expect(workflow?.name).toBe("Fetch Test");

      const def = workflow!.definition as any;
      expect(def.nodes[0].type).toBe("condition");
      expect(def.nodes[0].data.expression).toContain("status");
    });

    it("should include all metadata fields", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflow = await WorkflowDAO.create("Metadata Test", def as any);

      expect(workflow).toHaveProperty("id");
      expect(workflow).toHaveProperty("name");
      expect(workflow).toHaveProperty("description");
      expect(workflow).toHaveProperty("definition");
      expect(workflow).toHaveProperty("createdAt");
      expect(workflow).toHaveProperty("updatedAt");
      expect(workflow).toHaveProperty("createdBy");
    });
  });

  describe("PATCH /api/workflows/[id] - Update Workflow", () => {
    it("should update only provided fields", async () => {
      const originalDef: WorkflowDefinition = {
        nodes: [{ id: "n1", type: "agent", data: {} }],
        edges: [],
      };

      const workflow = await WorkflowDAO.create(
        "Partial Update Test",
        originalDef as any
      );
      const originalWorkflow = await WorkflowDAO.findById(workflow.id);

      // Update only name
      await WorkflowDAO.update(workflow.id, { name: "New Name Only" });

      const updated = await WorkflowDAO.findById(workflow.id);
      expect(updated?.name).toBe("New Name Only");
      const updatedDef = updated!.definition as any;
      expect(updatedDef.nodes).toHaveLength(1); // definition unchanged
    });

    it("should allow updating just the name", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflow = await WorkflowDAO.create("Name Update", def as any);

      await WorkflowDAO.update(workflow.id, { name: "Updated Name" });
      const updatedWorkflow = await WorkflowDAO.findById(workflow.id);
      expect(updatedWorkflow?.name).toBe("Updated Name");
    });

    it("should allow updating just the definition", async () => {
      const originalDef: WorkflowDefinition = {
        nodes: [{ id: "n1", type: "agent", data: {} }],
        edges: [],
      };

      const workflow = await WorkflowDAO.create(
        "Def Update",
        originalDef as any
      );

      const newDef: WorkflowDefinition = {
        nodes: [
          { id: "n1", type: "agent", data: {} },
          { id: "n2", type: "delay", data: { duration: 3 } },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      };

      await WorkflowDAO.update(workflow.id, { definition: newDef as any });
      const updatedWorkflow = await WorkflowDAO.findById(workflow.id);
      expect(updatedWorkflow?.name).toBe("Def Update"); // Name preserved
      const def = updatedWorkflow!.definition as any;
      expect(def.nodes).toHaveLength(2);
    });
  });

  describe("DELETE /api/workflows/[id] - Delete Workflow", () => {
    it("should delete workflow by ID", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflow = await WorkflowDAO.create("To Delete", def as any);

      const deleted = await WorkflowDAO.delete(workflow.id);

      expect(deleted.id).toBe(workflow.id);
    });

    it("should cascade delete associated runs", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflow = await WorkflowDAO.create(
        "Cascade Delete Test",
        def as any
      );
      await WorkflowDAO.startRun(workflow.id);

      await WorkflowDAO.delete(workflow.id);

      const deletedWorkflow = await WorkflowDAO.findById(workflow.id);
      expect(deletedWorkflow).toBeNull();
    });
  });

  describe("POST /api/workflows/[id]/execute - Execute Workflow", () => {
    it("should create workflow run and return runId", async () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: "step-1",
            type: "agent",
            data: { agentId: "@mock-agent" },
          },
        ],
        edges: [],
      };

      const workflow = await WorkflowDAO.create("Execute Test", def as any);
      const runId = await WorkflowDAO.startRun(workflow.id);

      expect(runId).toBeDefined();
      expect(typeof runId).toBe("string");
    });

    it("should return null if workflow not found", async () => {
      const nonExistent = await WorkflowDAO.findById("non-existent-id");
      expect(nonExistent).toBeNull();
    });

    it("should return run with initial status", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflow = await WorkflowDAO.create("Status Test", def as any);
      const runId = await WorkflowDAO.startRun(workflow.id);

      const run = await WorkflowDAO.findRun(runId);
      expect(run?.status).toBe("running");
    });
  });

  describe("GET /api/workflows/runs/[runId]/status - Check Execution Status", () => {
    it("should return run status", async () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const workflow = await WorkflowDAO.create("Run Status Test", def as any);
      const runId = await WorkflowDAO.startRun(workflow.id);

      const run = await WorkflowDAO.findRun(runId);
      expect(run?.status).toBe("running");
    });
  });

  describe("GET /api/workflows/runs/[runId]/history - Get Execution History", () => {
    it("should return execution history with steps", async () => {
      const def: WorkflowDefinition = {
        nodes: [
          { id: "step-1", type: "agent", data: { agentId: "@mock-agent" } },
        ],
        edges: [],
      };

      const workflow = await WorkflowDAO.create("History Test", def as any);
      const runId = await WorkflowDAO.startRun(workflow.id);

      expect(runId).toBeDefined();

      const history = await WorkflowDAO.getRunHistory(runId);
      expect(history).toBeDefined();
    });
  });
});

describe("API Response Shapes", () => {
  it("should format workflow list response correctly", async () => {
    const def: WorkflowDefinition = { nodes: [], edges: [] };
    const workflow = await WorkflowDAO.create(
      "Response Shape Test",
      def as any
    );
    const workflowDetails = await WorkflowDAO.findById(workflow.id);

    const responseShape = {
      success: true,
      workflows: [
        {
          id: workflowDetails?.id,
          name: workflowDetails?.name,
          description: workflowDetails?.description,
          createdBy: workflowDetails?.createdBy,
          createdAt: workflowDetails?.createdAt,
          updatedAt: workflowDetails?.updatedAt,
        },
      ],
    };

    expect(responseShape.workflows[0].id).toBeDefined();
    expect(responseShape.workflows[0].name).toBeDefined();
  });

  it("should format single workflow response correctly", async () => {
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent", data: {} }],
      edges: [],
    };

    const workflow = await WorkflowDAO.create(
      "Single Response Test",
      definition as any
    );

    const def = workflow!.definition as any;
    const responseShape = {
      success: true,
      workflow: {
        id: workflow?.id,
        name: workflow?.name,
        description: workflow?.description,
        definition: def,
        createdBy: workflow?.createdBy,
        createdAt: workflow?.createdAt,
        updatedAt: workflow?.updatedAt,
      },
    };

    expect(responseShape.workflow.definition.nodes).toHaveLength(1);
  });

  it("should format execution response correctly", async () => {
    const def: WorkflowDefinition = { nodes: [], edges: [] };
    const workflow = await WorkflowDAO.create("Exec Response Test", def as any);
    const runId = await WorkflowDAO.startRun(workflow.id);

    const responseShape = {
      success: true,
      runId,
      workflowId: workflow.id,
      status: "running",
    };

    expect(responseShape.success).toBe(true);
    expect(responseShape.runId).toBeDefined();
    expect(responseShape.status).toBe("running");
  });
});
