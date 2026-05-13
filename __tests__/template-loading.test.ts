/**
 * Test for template loading in the UI flow
 * Validates that template data is preserved when navigating to the editor
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "../packages/control-plane/components/workflow/store";

describe("Template Loading Flow", () => {
  beforeEach(() => {
    // Reset store before each test
    const { clearWorkflow } = useWorkflowStore.getState();
    clearWorkflow();
  });

  it("should preserve template data in store when loading from template", () => {
    const { setWorkflow, definition, workflowName } = useWorkflowStore.getState();

    // Simulate template loading: template has nodes and edges
    const templateDefinition = {
      nodes: [
        { id: "node-1", type: "agent", data: { agentId: "@mock-agent" } },
        { id: "node-2", type: "agent", data: { agentId: "writer" } },
      ],
      edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
    };

    setWorkflow("", "Code Analysis Pipeline", "", templateDefinition);

    // Verify template data is in store
    const state = useWorkflowStore.getState();
    expect(state.definition.nodes.length).toBe(2);
    expect(state.definition.edges.length).toBe(1);
    expect(state.workflowName).toBe("Code Analysis Pipeline");
  });

  it("should detect template-loaded workflow vs blank new workflow", () => {
    // Test 1: Blank new workflow (from "New Workflow" button)
    const blankDefinition = { nodes: [], edges: [] };
    const { setWorkflow: setWorkflow1 } = useWorkflowStore.getState();
    setWorkflow1("", "Untitled Workflow", "", blankDefinition);

    let state = useWorkflowStore.getState();
    const isBlank = state.definition.nodes.length === 0;
    expect(isBlank).toBe(true);

    // Test 2: Template-loaded workflow
    const templateDef = {
      nodes: [{ id: "test", type: "agent", data: {} }],
      edges: [],
    };
    const { setWorkflow: setWorkflow2 } = useWorkflowStore.getState();
    setWorkflow2("", "From Template", "", templateDef);

    state = useWorkflowStore.getState();
    const isFromTemplate = state.definition.nodes.length > 0;
    expect(isFromTemplate).toBe(true);
  });

  it("should preserve template definition after clearWorkflow is called then setWorkflow", () => {
    const { clearWorkflow, setWorkflow } = useWorkflowStore.getState();

    // This simulates the handleSelectTemplate function flow:
    // 1. clearWorkflow() is called first
    clearWorkflow();

    // 2. Then setWorkflow() is called with template data
    const templateDef = {
      nodes: [
        { id: "input", type: "agent", data: { agentId: "@mock-agent" } },
        { id: "process", type: "agent", data: { agentId: "code-analyst" } },
      ],
      edges: [{ id: "e1", source: "input", target: "process" }],
    };

    setWorkflow("", "Analysis Template", "", templateDef);

    // Verify template data is preserved
    const state = useWorkflowStore.getState();
    expect(state.definition.nodes.length).toBe(2);
    expect(state.definition.edges.length).toBe(1);
    expect(state.workflowName).toBe("Analysis Template");
  });

  it("should editor page logic correctly detect template vs blank workflow", () => {
    const { setWorkflow } = useWorkflowStore.getState();

    // Template case: should NOT clear because nodes.length > 0
    const templateDef = {
      nodes: [{ id: "test", type: "agent", data: {} }],
      edges: [],
    };
    setWorkflow("", "From Template", "", templateDef);

    let state = useWorkflowStore.getState();
    const shouldClearTemplate = state.definition.nodes.length === 0;
    expect(shouldClearTemplate).toBe(false); // Don't clear - preserve template

    // Blank case: should clear because nodes.length === 0
    const blankDef = { nodes: [], edges: [] };
    setWorkflow("", "Untitled Workflow", "", blankDef);

    state = useWorkflowStore.getState();
    const shouldClearBlank = state.definition.nodes.length === 0;
    expect(shouldClearBlank).toBe(true); // Clear - truly blank
  });
});
