import { create } from "zustand";
import type { WorkflowDefinition } from "@/lib/workflow-types";

export interface WorkflowState {
  // Current workflow being edited
  workflowId: string | null;
  workflowName: string;
  workflowDescription: string;
  workflowWorkspaceId: string;
  workflowInput: string;
  definition: WorkflowDefinition;

  // Execution state
  isExecuting: boolean;
  executionRunId: string | null;
  executionStartTime: number | null;
  stepOutputs: Map<string, unknown>;
  stepStatus: Map<string, string>; // step_id -> "pending" | "running" | "success" | "failed"

  // UI state
  selectedNodeId: string | null;
  showExecutionPanel: boolean;

  // Actions
  setWorkflow: (
    id: string,
    name: string,
    description: string,
    definition: WorkflowDefinition,
    workspaceId?: string
  ) => void;
  setDefinition: (definition: WorkflowDefinition) => void;
  setSelectedNode: (nodeId: string | null) => void;
  clearWorkflow: () => void;
  setWorkspaceId: (workspaceId: string) => void;
  setWorkflowInput: (input: string) => void;
  setWorkflowName: (name: string) => void;
  setWorkflowDescription: (description: string) => void;

  // Execution actions
  startExecution: (runId: string) => void;
  endExecution: () => void;
  setStepStatus: (stepId: string, status: string) => void;
  setStepOutput: (stepId: string, output: unknown) => void;
  setShowExecutionPanel: (show: boolean) => void;
}

const initialDefinition: WorkflowDefinition = {
  nodes: [],
  edges: [],
};

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflowId: null,
  workflowName: "Untitled Workflow",
  workflowDescription: "",
  workflowWorkspaceId: "default",
  workflowInput: "",
  definition: initialDefinition,
  isExecuting: false,
  executionRunId: null,
  executionStartTime: null,
  stepOutputs: new Map(),
  stepStatus: new Map(),
  selectedNodeId: null,
  showExecutionPanel: false,

  setWorkflow: (id, name, description, definition, workspaceId = "default") =>
    set({
      workflowId: id,
      workflowName: name,
      workflowDescription: description,
      definition,
      workflowWorkspaceId: workspaceId,
    }),

  setDefinition: (definition) => set({ definition }),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  setWorkspaceId: (workspaceId) => set({ workflowWorkspaceId: workspaceId }),

  setWorkflowInput: (input) => set({ workflowInput: input }),

  setWorkflowName: (name) => set({ workflowName: name }),

  setWorkflowDescription: (description) =>
    set({ workflowDescription: description }),

  clearWorkflow: () =>
    set({
      workflowId: null,
      workflowName: "Untitled Workflow",
      workflowDescription: "",
      workflowWorkspaceId: "default",
      workflowInput: "",
      definition: initialDefinition,
      selectedNodeId: null,
      stepOutputs: new Map(),
      stepStatus: new Map(),
    }),

  startExecution: (runId) =>
    set({
      isExecuting: true,
      executionRunId: runId,
      executionStartTime: Date.now(),
      showExecutionPanel: true,
      stepOutputs: new Map(),
      stepStatus: new Map(),
    }),

  endExecution: () => set({ isExecuting: false }),

  setStepStatus: (stepId, status) =>
    set((state) => {
      const newStatus = new Map(state.stepStatus);
      newStatus.set(stepId, status);
      return { stepStatus: newStatus };
    }),

  setStepOutput: (stepId, output) =>
    set((state) => {
      const newOutputs = new Map(state.stepOutputs);
      newOutputs.set(stepId, output);
      return { stepOutputs: newOutputs };
    }),

  setShowExecutionPanel: (show) => set({ showExecutionPanel: show }),
}));
