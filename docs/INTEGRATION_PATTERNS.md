# Integration Patterns & Code Examples

This document provides concrete code patterns for integrating workflows with workspaces and real agent execution.

---

## 1. RETRIEVING AGENT LISTS FOR A WORKSPACE

### Current Implementation

```typescript
// Get all agents (no workspace filtering)
export async function GET() {
  const wsServer = getWSServer();
  const dbAgents = getAllAgents();

  const agents = dbAgents.map((agent) => {
    const workspaces = getAgentWorkspaces(agent.did);
    return {
      id: agent.did,
      name: agent.name,
      workspaces: workspaces.map((r) => ({
        id: r.workspace_id,
        name: r.name,
        slug: r.slug,
        isPrimary: Boolean(r.is_primary),
      })),
    };
  });
  return NextResponse.json({ agents });
}
```

### Proposed: Workspace-Filtered Agent List

```typescript
// New endpoint: GET /api/workspaces/[id]/agents
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id: workspaceId } = await ctx.params;
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace)
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    // Get agents in this workspace
    const workspaceAgents = getWorkspaceAgents(workspaceId);

    // Enrich with live status from WebSocket server
    const wsServer = getWSServer();
    const agents = workspaceAgents.map((agent) => {
      const connected = wsServer?.getAgent(agent.agent_did);
      return {
        id: agent.agent_did,
        name: agent.agent_name,
        capabilities: JSON.parse(agent.capabilities),
        isPrimaryInWorkspace: Boolean(agent.is_primary),
        joinedAt: agent.joined_at,
        online: connected !== undefined,
        connectedAt: connected?.connectedAt?.toISOString() ?? null,
        lastHeartbeat: connected?.lastHeartbeat?.toISOString() ?? null,
      };
    });

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      agents,
      total: agents.length,
      online: agents.filter((a) => a.online).length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch workspace agents" },
      { status: 500 }
    );
  }
}
```

### Global Agent List with Workspace Filter

```typescript
// Enhancement: GET /api/agents?workspace=[id]
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get("workspace");

    const wsServer = getWSServer();
    let dbAgents: AgentRow[];

    if (workspaceId) {
      // Get agents in specific workspace
      const workspaceAgents = getWorkspaceAgents(workspaceId);
      dbAgents = workspaceAgents
        .map((ra) => getAgent(ra.agent_did)!)
        .filter(Boolean);
    } else {
      // Get all agents
      dbAgents = getAllAgents();
    }

    const agents = dbAgents.map((agent) => {
      const connected = wsServer?.getAgent(agent.did);
      const workspaces = getAgentWorkspaces(agent.did);

      return {
        id: agent.did,
        name: agent.name,
        capabilities: JSON.parse(agent.capabilities),
        workspaces: workspaces.map((r) => ({
          id: r.workspace_id,
          name: r.name,
          isPrimary: Boolean(r.is_primary),
        })),
        online: connected !== undefined,
        // ... rest of agent properties
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}
```

---

## 2. ASSOCIATING WORKFLOWS WITH WORKSPACES

### Database Migration

```typescript
// Add to migrateSchema in lib/db.ts
const workflowCols = (
  db.pragma("table_info(workflows)") as { name: string }[]
).map((c) => c.name);

if (!workflowCols.includes("workspace_id")) {
  db.exec(`
    ALTER TABLE workflows ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows(workspace_id, created_at DESC);
  `);
}
```

### Updated Workflow Functions

```typescript
// lib/db.ts - Updated functions

export function saveWorkflow(
  name: string,
  definition: WorkflowDefinition,
  createdBy?: string,
  workspaceId?: string
): string {
  const d = getDb();
  const id = crypto.randomUUID();
  d.prepare(
    "INSERT INTO workflows (id, name, definition, created_by, workspace_id) VALUES (?, ?, ?, ?, ?)"
  ).run(
    id,
    name,
    JSON.stringify(definition),
    createdBy ?? null,
    workspaceId ?? null
  );
  return id;
}

export function listWorkflows(
  createdBy?: string,
  workspaceId?: string
): WorkflowRow[] {
  const d = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (createdBy) {
    conditions.push("created_by = ?");
    params.push(createdBy);
  }

  if (workspaceId) {
    conditions.push("workspace_id = ?");
    params.push(workspaceId);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return d
    .prepare(`SELECT * FROM workflows ${where} ORDER BY created_at DESC`)
    .all(...params) as WorkflowRow[];
}

export function getWorkflowsByWorkspace(workspaceId: string): WorkflowRow[] {
  const d = getDb();
  return d
    .prepare(
      "SELECT * FROM workflows WHERE workspace_id = ? ORDER BY created_at DESC"
    )
    .all(workspaceId) as WorkflowRow[];
}
```

### Updated API Endpoints

```typescript
// app/api/workspaces/[id]/workflows/route.ts (NEW)

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id: workspaceId } = await ctx.params;
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace)
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const workflows = getWorkflowsByWorkspace(workspaceId);

    return NextResponse.json({
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        createdBy: w.created_by,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
      total: workflows.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch workspace workflows" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id: workspaceId } = await ctx.params;
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace)
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
      createdBy?: string;
    };

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const id = saveWorkflow(
      body.name,
      body.definition ?? { nodes: [], edges: [] },
      body.createdBy,
      workspaceId
    );

    return NextResponse.json({ success: true, id, workspaceId }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to create workflow" },
      { status: 500 }
    );
  }
}
```

```typescript
// app/api/workflows/route.ts (UPDATED)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const createdBy = searchParams.get("createdBy");
    const workspaceId = searchParams.get("workspaceId");

    const workflows = listWorkflows(
      createdBy ?? undefined,
      workspaceId ?? undefined
    );

    return NextResponse.json({
      success: true,
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        createdBy: w.created_by,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        workspaceId: w.workspace_id || null,
      })),
    });
  } catch (err) {
    console.error("GET /api/workflows error:", err);
    return NextResponse.json(
      { error: "Failed to list workflows" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, definition, workspaceId, createdBy } = body as {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
      workspaceId?: string;
      createdBy?: string;
    };

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name (string) is required" },
        { status: 400 }
      );
    }
    if (!definition || typeof definition !== "object") {
      return NextResponse.json(
        { error: "definition (object) is required" },
        { status: 400 }
      );
    }

    // Validate workspace exists if provided
    if (workspaceId) {
      const workspace = getWorkspaceById(workspaceId);
      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
    }

    const id = saveWorkflow(name, definition, createdBy, workspaceId);

    return NextResponse.json({
      success: true,
      id,
      name,
      description,
      workspaceId: workspaceId || null,
    });
  } catch (err) {
    console.error("POST /api/workflows error:", err);
    return NextResponse.json(
      { error: "Failed to save workflow" },
      { status: 500 }
    );
  }
}
```

---

## 3. REAL AGENT EXECUTION IN WORKFLOWS

### Agent Lookup & Communication

```typescript
// lib/workflow-executor.ts (UPDATED)

import { getWSServer } from "./ws-server";
import { getAgent } from "./db";

interface Agent {
  id: string;
  name: string;
  send(message: any): void;
}

/**
 * Resolve agent by DID — first check WebSocket connections, then database
 */
function resolveAgent(agentId: string): Agent | null {
  const wsServer = getWSServer();

  // First, check live connections
  const connected = wsServer?.getAgent(agentId);
  if (connected) {
    return {
      id: agentId,
      name: connected.name,
      send: (msg) => connected.send(msg),
    };
  }

  // Fall back to database (offline agent)
  const dbAgent = getAgent(agentId);
  if (dbAgent) {
    console.warn(
      `Agent ${agentId} is offline (last seen: ${dbAgent.last_seen})`
    );
    return null; // Can't execute on offline agents
  }

  return null;
}

/**
 * Execute step with real agent
 */
export async function executeStep(
  stepId: string,
  node: WorkflowNode,
  params: Record<string, unknown>,
  context: ExecutionContext
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  try {
    const stepDbId = context.stepIds.get(stepId);
    if (!stepDbId) {
      return { success: false, error: "Step not found in execution context" };
    }

    updateWorkflowStep(stepDbId, "running");

    const agentId = node.data.agentId ?? "@mock-agent";

    // Mock agent path (existing)
    if (agentId === "@mock-agent") {
      const duration = (node.data.duration as number) ?? 1000;
      await new Promise((resolve) => setTimeout(resolve, duration));

      const mockOutput = {
        nodeId: node.id,
        nodeType: node.type,
        timestamp: new Date().toISOString(),
        status: "success",
        message: `Mock execution of ${node.type} node`,
      };

      context.stepOutputs.set(stepId, mockOutput);
      context.stepStatus.set(stepId, "success");
      updateWorkflowStep(stepDbId, "success", mockOutput);
      return { success: true, output: mockOutput };
    }

    // Real agent execution
    const agent = resolveAgent(agentId);
    if (!agent) {
      const error = `Agent ${agentId} not found or offline`;
      updateWorkflowStep(stepDbId, "failed", undefined, error);
      return { success: false, error };
    }

    // Send task to agent
    const taskId = crypto.randomUUID();
    const task = {
      type: "workflow_step",
      taskId,
      workflowRunId: context.runId,
      stepId: node.id,
      params,
      timeout: 30000, // 30 second timeout
    };

    const result = await sendTaskToAgent(agent, task);

    if (result.success) {
      context.stepOutputs.set(stepId, result.output);
      context.stepStatus.set(stepId, "success");
      updateWorkflowStep(stepDbId, "success", result.output);
      return { success: true, output: result.output };
    } else {
      const error = result.error ?? "Agent execution failed";
      context.stepStatus.set(stepId, "failed");
      updateWorkflowStep(stepDbId, "failed", undefined, error);
      return { success: false, error };
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
 * Send task to agent and wait for response with timeout
 */
async function sendTaskToAgent(
  agent: Agent,
  task: any
): Promise<{ success: boolean; output?: any; error?: string }> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ success: false, error: "Agent response timeout" });
    }, task.timeout ?? 30000);

    // Send task to agent
    agent.send({
      type: "execute_workflow_step",
      payload: task,
      responseChannel: `workflow-step-${task.taskId}`,
    });

    // TODO: Listen for response on responseChannel
    // This requires WebSocket server to route messages back
    // For now, this is a placeholder for the integration pattern
  });
}
```

### WebSocket Server Integration (lib/ws-server.ts)

```typescript
// Pattern for handling workflow step responses

class AgentWebSocketServer {
  // Existing methods...

  /**
   * Send a workflow step task to an agent
   */
  sendWorkflowStepTask(agentId: string, task: any): Promise<any> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return Promise.reject(new Error(`Agent ${agentId} not connected`));
    }

    const taskId = task.taskId;
    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.taskCallbacks.delete(taskId);
        reject(new Error("Task timeout"));
      }, task.timeout ?? 30000);

      this.taskCallbacks.set(taskId, {
        resolve,
        reject,
        timeout,
      });
    });

    agent.send(
      JSON.stringify({
        type: "execute_workflow_step",
        payload: task,
      })
    );

    return responsePromise;
  }

  /**
   * Handle workflow step response from agent
   */
  handleWorkflowStepResponse(
    agentId: string,
    taskId: string,
    result: any
  ): void {
    const callback = this.taskCallbacks.get(taskId);
    if (callback) {
      clearTimeout(callback.timeout);
      callback.resolve(result);
      this.taskCallbacks.delete(taskId);
    }
  }

  private taskCallbacks = new Map<
    string,
    {
      resolve: (result: any) => void;
      reject: (error: any) => void;
      timeout: NodeJS.Timeout;
    }
  >();
}
```

---

## 4. WORKSPACE-AWARE WORKFLOW EXECUTION

### Check Agent Availability in Workflow's Workspace

```typescript
// lib/workflow-executor.ts - Validation

export async function validateWorkflowExecution(
  definition: WorkflowDefinition,
  workspaceId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const workspace = getWorkspaceById(workspaceId);

  if (!workspace) {
    return { valid: false, errors: ["Workspace not found"] };
  }

  const nodes = definition.nodes;
  const workspaceAgents = new Set(getWorkspaceAgents(workspaceId).map((a) => a.agent_did));

  // Validate all agent nodes
  for (const node of nodes) {
    if (node.type === "agent" && node.data.agentId !== "@mock-agent") {
      const agentId = node.data.agentId as string;

      if (!workspaceAgents.has(agentId)) {
        errors.push(
          `Agent ${agentId} (node ${node.id}) is not in workspace ${workspace.name}`
        );
      }

      const agent = getAgent(agentId);
      if (!agent) {
        errors.push(`Agent ${agentId} (node ${node.id}) does not exist`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Usage in workflow execution:
export async function executeWorkflow(
  runId: string,
  definition: WorkflowDefinition,
  workspaceId: string
): Promise<void> {
  // Validate agents are in workspace
  const validation = await validateWorkflowExecution(definition, workspaceId);
  if (!validation.valid) {
    logger.error(
      { runId, errors: validation.errors },
      "Workflow validation failed"
    );
    updateWorkflowRunStatus(runId, "failed", {
      error: "Workflow validation failed",
      details: validation.errors,
    });
    return;
  }

  // ... continue with execution
}
```

### Updated Workflow Execute API

```typescript
// app/api/workflows/[id]/execute/route.ts (UPDATED)

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params;

    const workflow = getWorkflow(workflowId);
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // Validate workspace association
    const workspaceId = workflow.workspace_id;
    if (workspaceId) {
      const workspace = getWorkspaceById(workspaceId);
      if (!workspace) {
        return NextResponse.json(
          { error: "Workflow's workspace no longer exists" },
          { status: 400 }
        );
      }

      // Validate agents in workflow are still in workspace
      const definition = JSON.parse(workflow.definition);
      const validation = await validateWorkflowExecution(definition, workspaceId);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: "Workflow validation failed",
            details: validation.errors,
          },
          { status: 400 }
        );
      }
    }

    // Start execution
    const runId = startWorkflowRun(workflowId);
    const definition = JSON.parse(workflow.definition);

    Promise.resolve().then(() => {
      executeWorkflow(runId, definition, workspaceId).catch((err) => {
        console.error(`Workflow ${runId} execution failed:`, err);
      });
    });

    return NextResponse.json({
      success: true,
      runId,
      workflowId,
      workspaceId: workspaceId || null,
      status: "running",
    });
  } catch (err) {
    console.error("POST /api/workflows/[id]/execute error:", err);
    return NextResponse.json(
      { error: "Failed to start workflow execution" },
      { status: 500 }
    );
  }
}
```

---

## 5. SUGGESTED API ENDPOINT SUMMARY

### Workspace Workflows

- `GET /api/workspaces/[id]/workflows` — List workflows in workspace
- `POST /api/workspaces/[id]/workflows` — Create workflow in workspace
- `DELETE /api/workspaces/[id]/workflows/[wid]` — Delete workflow from workspace

### Agent Lists

- `GET /api/agents?workspace=[id]` — Filter agents by workspace
- `GET /api/workspaces/[id]/agents` — Get agents in workspace

### Workflow Execution

- `POST /api/workflows/[id]/execute?workspaceId=[id]` — Execute with workspace context
- `GET /api/workflows/[id]/workspaces` — List workspaces where workflow can execute

### Enhanced Status Tracking

- `GET /api/workflows/runs/[runId]/agents` — Agents used in this run
- `GET /api/workflows/[id]/agents` — List agents referenced in workflow
