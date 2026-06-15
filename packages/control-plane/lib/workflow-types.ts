export interface WorkflowDefinition {
  nodes: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data?: Record<string, unknown>;
  }>;
  /** Default input passed to the first node. Can be overridden at execution time. */
  input?: string;
}
