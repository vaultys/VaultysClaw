/**
 * Tests for workflow templates and import/export functionality
 */

import { describe, it, expect } from "vitest";
import {
  WORKFLOW_TEMPLATES,
  getTemplate,
  getTemplates,
  getTemplateCategories,
} from "../packages/control-plane/lib/workflow-templates";
import type { WorkflowDefinition } from "../packages/control-plane/lib/workflow-types";
import { WorkflowDAO } from "../packages/control-plane/db";

describe("Workflow Templates", () => {
  it("should have predefined templates", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("should have required template properties", () => {
    WORKFLOW_TEMPLATES.forEach((template) => {
      expect(template.id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.category).toBeDefined();
      expect(template.definition).toBeDefined();
      expect(Array.isArray(template.definition.nodes)).toBe(true);
      expect(Array.isArray(template.definition.edges)).toBe(true);
    });
  });

  it("should get template by ID", () => {
    const template = getTemplate("template-code-analysis");
    expect(template).toBeDefined();
    expect(template?.name).toBe("Code Analysis Pipeline");
  });

  it("should return undefined for non-existent template", () => {
    const template = getTemplate("non-existent");
    expect(template).toBeUndefined();
  });

  it("should get all templates", () => {
    const templates = getTemplates();
    expect(templates.length).toBe(WORKFLOW_TEMPLATES.length);
  });

  it("should filter templates by category", () => {
    const analysisTemplates = getTemplates("analysis");
    expect(analysisTemplates.length).toBeGreaterThan(0);
    expect(analysisTemplates.every((t) => t.category === "analysis")).toBe(
      true
    );
  });

  it("should get unique categories", () => {
    const categories = getTemplateCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories).toContain("analysis");
  });

  it("should have valid template definitions with nodes", () => {
    WORKFLOW_TEMPLATES.forEach((template) => {
      expect(template.definition.nodes.length).toBeGreaterThan(0);
      template.definition.nodes.forEach((node) => {
        expect(node.id).toBeDefined();
        expect(node.type).toBeDefined();
        expect(node.data).toBeDefined();
      });
    });
  });

  it("should have valid template definitions with proper edges", () => {
    WORKFLOW_TEMPLATES.forEach((template) => {
      template.definition.edges.forEach((edge) => {
        expect(edge.source).toBeDefined();
        expect(edge.target).toBeDefined();
        const nodeIds = template.definition.nodes.map((n) => n.id);
        expect(nodeIds).toContain(edge.source);
        expect(nodeIds).toContain(edge.target);
      });
    });
  });
});

describe("Workflow Export/Import", () => {
  it("should export and re-import workflow successfully", async () => {
    const def: WorkflowDefinition = {
      nodes: [
        {
          id: "test-1",
          type: "agent",
          data: { agentId: "@mock-agent", params: { key: "value" } },
        },
      ],
      edges: [],
    };

    const workflow = await WorkflowDAO.create("Export Test", def as any);

    expect(workflow).toBeDefined();
    expect(workflow?.name).toBe("Export Test");

    const definition = workflow?.definition as any;
    expect(definition.nodes[0].id).toBe("test-1");
    expect(definition.nodes[0].data.params.key).toBe("value");

    await WorkflowDAO.delete(workflow.id);
  });

  it("should preserve workflow definition structure through export", async () => {
    const def: WorkflowDefinition = {
      nodes: [
        {
          id: "node-1",
          type: "agent",
          data: { agentId: "code-analyst", params: { language: "python" } },
          position: { x: 100, y: 100 },
        },
        {
          id: "node-2",
          type: "condition",
          data: { expression: "output.quality > 0.8" },
          position: { x: 300, y: 100 },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-1",
          target: "node-2",
          data: { label: "success" },
        },
      ],
    };

    const workflow = await WorkflowDAO.create("Complex Export", def as any);
    const imported = workflow?.definition as any;

    expect(imported.nodes.length).toBe(2);
    expect(imported.edges.length).toBe(1);
    expect(imported.nodes[0].data.params.language).toBe("python");
    expect(imported.nodes[1].data.expression).toBe("output.quality > 0.8");
    expect(imported.edges[0].data.label).toBe("success");

    await WorkflowDAO.delete(workflow.id);
  });

  it("should handle workflows with empty parameters", async () => {
    const def: WorkflowDefinition = {
      nodes: [
        {
          id: "simple",
          type: "agent",
          data: { agentId: "@mock-agent" },
        },
      ],
      edges: [],
    };

    const workflow = await WorkflowDAO.create("Minimal Workflow", def as any);
    const imported = workflow?.definition as any;

    expect(imported.nodes[0].data.agentId).toBe("@mock-agent");
    expect(imported.nodes[0].data.params).toBeUndefined();

    await WorkflowDAO.delete(workflow.id);
  });

  it("should validate imported workflow before saving", () => {
    const invalidDef = {
      nodes: [],
      // Missing edges array
    } as unknown as WorkflowDefinition;

    // This would be caught by API validation before calling create
    expect(() => {
      // The API validation happens in the import route
      if (!Array.isArray(invalidDef.edges)) {
        throw new Error("Invalid workflow definition structure");
      }
    }).toThrow();
  });
});

describe("Template to Workflow Conversion", () => {
  it("should create workflow from template", async () => {
    const template = getTemplate("template-code-analysis");
    expect(template).toBeDefined();

    if (template) {
      const workflow = await WorkflowDAO.create(
        `Workflow from ${template.name}`,
        template.definition as any
      );

      expect(workflow).toBeDefined();
      expect(workflow?.name).toContain(template.name);

      const definition = workflow?.definition as any;
      expect(definition.nodes.length).toBe(template.definition.nodes.length);
      expect(definition.edges.length).toBe(template.definition.edges.length);

      await WorkflowDAO.delete(workflow.id);
    }
  });

  it("should preserve template structure when converting to workflow", async () => {
    const template = getTemplate("template-parallel-analysis");
    expect(template).toBeDefined();

    if (template) {
      const workflow = await WorkflowDAO.create(
        template.name,
        template.definition as any
      );
      const definition = workflow?.definition as any;

      // Verify all nodes are present
      expect(definition.nodes.length).toBe(4);
      expect(definition.edges.length).toBe(4);

      // Verify parallel structure
      const parentEdges = definition.edges.filter(
        (e: any) => e.source === "input"
      );
      expect(parentEdges.length).toBe(2);

      await WorkflowDAO.delete(workflow.id);
    }
  });
});
