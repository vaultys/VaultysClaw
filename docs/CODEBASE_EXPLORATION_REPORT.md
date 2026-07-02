# VaultysClaw Codebase Exploration Report

**Date:** May 13, 2026  
**Focus:** Workspace Structure, Agent Management, and Workflow Integration

---

## 1. WORKSPACE STRUCTURE & ARCHITECTURE

### Database Schema

Workspaces are stored in a dedicated `workspaces` table with the following structure:

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,                  -- UUID
  name TEXT NOT NULL,                   -- "Engineering", "Security Ops", etc.
  slug TEXT NOT NULL UNIQUE,            -- "engineering", "security-ops", etc. (URL-friendly)
  description TEXT,                     -- Long description of workspace purpose
  color TEXT NOT NULL DEFAULT '#6366f1',-- Hex color for UI
  is_default INTEGER NOT NULL DEFAULT 0,-- Boolean: one default workspace must exist
  llm_config TEXT DEFAULT NULL,         -- JSON LLM config (per-workspace settings)
  default_capabilities TEXT NOT NULL DEFAULT '[]', -- JSON array of default agent capabilities
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Workspace Characteristics

| Property                 | Type       | Purpose                                            |
| ------------------------ | ---------- | -------------------------------------------------- |
| **id**                   | UUID       | Primary key                                        |
| **name**                 | String     | Display name for UI                                |
| **slug**                 | String     | URL-friendly identifier (UNIQUE)                   |
| **description**          | String     | Explains workspace's purpose                           |
| **color**                | Hex color  | UI theming                                         |
| **is_default**           | Boolean    | Exactly ONE workspace must be default                  |
| **llm_config**           | JSON       | Can override global LLM settings per workspace         |
| **default_capabilities** | JSON array | Default capabilities for agents joining this workspace |
| **created_at**           | Timestamp  | Audit trail                                        |

### Workspace Operations (lib/db.ts)

```typescript
// Query operations
getAllWorkspaces()                  // All workspaces, sorted by is_default DESC, name ASC
getWorkspaceById(id: string)       // Single workspace by UUID
getWorkspaceBySlug(slug: string)   // Single workspace by slug
getDefaultWorkspace()              // The one default workspace

// Mutations
createWorkspace(data)              // Create with name, slug, description, color
updateWorkspace(id, updates)       // Update name, slug, description, color, llm_config, default_capabilities
deleteWorkspace(id)                // Delete (fails if is_default=1)
setDefaultWorkspace(id)            // Atomic: set one as default, unset others
```

### API Endpoints

| Endpoint                  | Method | Purpose                                             |
| ------------------------- | ------ | --------------------------------------------------- |
| `/api/workspaces`             | GET    | List all workspaces with member counts (agents + users) |
| `/api/workspaces`             | POST   | Create new workspace                                    |
| `/api/workspaces/[id]`        | GET    | Get workspace detail + agents + users + token usage     |
| `/api/workspaces/[id]`        | PATCH  | Update workspace metadata                               |
| `/api/workspaces/[id]`        | DELETE | Delete workspace (blocks default)                       |
| `/api/workspaces/[id]/agents` | GET    | (implied) Get agents in workspace                       |
| `/api/workspaces/[id]/agents` | POST   | Add agent to workspace                                  |
| `/api/workspaces/[id]/agents` | DELETE | Remove agent from workspace                             |
| `/api/workspaces/[id]/users`  | GET    | Get users in workspace                                  |
| `/api/workspaces/[id]/users`  | POST   | Add user to workspace                                   |
| `/api/workspaces/[id]/users`  | DELETE | Remove user from workspace                              |

---

## 2. HOW DATA IS ASSOCIATED WITH WORKSPACES

### Agent-Workspace Association

Agents are linked to workspaces via a **many-to-many junction table**:

```sql
CREATE TABLE agent_workspaces (
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,    -- Agent's primary workspace
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (agent_did, workspace_id)
);
```

**Key Points:**

- An agent can belong to **multiple workspaces**
- One workspace is marked as **primary** (the agent's "home")
- When an agent registers, it's auto-enrolled in the **default workspace** as primary
- Cross-workspace memberships happen via explicit API calls

**Functions:**

```typescript
getAgentWorkspaces(agentDid); // Returns WorkspaceMembershipRow[]
addAgentToWorkspace(agentDid, workspaceId, isPrimary); // Add/update membership
removeAgentFromWorkspace(agentDid, workspaceId); // Remove (fails for default)
getWorkspaceAgents(workspaceId); // Get all agents in a workspace
enrollInDefaultWorkspace("agent", did); // Auto-enroll after registration
```

### User-Workspace Association

Users follow the same pattern:

```sql
CREATE TABLE user_workspaces (
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_did, workspace_id)
);
```

**Functions:**

```typescript
getUserWorkspaces(userDid);
addUserToWorkspace(userDid, workspaceId, isPrimary);
removeUserFromWorkspace(userDid, workspaceId);
getWorkspaceUsers(workspaceId);
```

---

## 3. AGENT STRUCTURE & MANAGEMENT

### Agent Database Schema

```sql
CREATE TABLE agents (
  did TEXT PRIMARY KEY,                    -- did:vaultys:<hex32>
  name TEXT NOT NULL,                      -- "code-review-agent", "data-processor", etc.
  public_key TEXT,                         -- For verification
  capabilities TEXT NOT NULL DEFAULT '[]', -- JSON array of capability strings
  certificate_data TEXT,                   -- Auth certificate
  llm_config TEXT DEFAULT NULL,            -- JSON LLM config (per-agent override)
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Agent Properties

| Property             | Type       | Purpose                                |
| -------------------- | ---------- | -------------------------------------- |
| **did**              | String     | Decentralized Identifier (primary key) |
| **name**             | String     | Human-readable name                    |
| **public_key**       | String     | For cryptographic verification         |
| **capabilities**     | JSON array | List of permitted operations           |
| **certificate_data** | String     | Auth credentials                       |
| **llm_config**       | JSON       | Per-agent LLM override                 |
| **registered_at**    | Timestamp  | Registration time                      |
| **last_seen**        | Timestamp  | Last activity (heartbeat)              |

### Available Capabilities

```typescript
"file_access"; // Read/write files
"internet_access"; // HTTP requests
"browser_control"; // Browser automation
"api_call"; // API integrations
"mail_send"; // Email sending
"code_execution"; // Run code
"system_command"; // Execute OS commands
```

### Agent API Endpoint

**GET /api/agents** — Returns **all** agents with live status:

```json
{
  "agents": [
    {
      "id": "did:vaultys:...",
      "name": "code-review-agent",
      "capabilities": ["code_execution", "file_access", "api_call"],
      "registeredAt": "2026-05-01T...",
      "lastSeen": "2026-05-13T10:00:00Z",
      "online": true,
      "connectedAt": "2026-05-13T09:50:00Z",
      "lastHeartbeat": "2026-05-13T10:00:00Z",
      "reportedLlm": null,
      "tokenUsage": null,
      "workspaces": [
        {
          "id": "workspace-123",
          "name": "Engineering",
          "slug": "engineering",
          "color": "#6366f1",
          "isPrimary": true
        }
      ]
    }
  ],
  "total": 500,
  "online": 45
}
```

**Key Observations:**

- Returns agents from **both DB and live WebSocket** connections
- Includes **workspace memberships** with is_primary flag
- Shows **online status** + live metadata (heartbeat, reported LLM, token usage)
- ⚠️ **NO workspace-specific filtering** — returns all agents globally

---

## 4. CURRENT WORKFLOW DATABASE SCHEMA

### Workflow Table

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,                    -- UUID
  name TEXT NOT NULL,                     -- "Code Review Workflow", etc.
  description TEXT,                       -- Optional description
  definition TEXT NOT NULL,               -- JSON WorkflowDefinition
  created_by TEXT,                        -- User DID who created it
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_workflows_created_by ON workflows(created_by, created_at DESC);
```

### Workflow Run Table

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,                    -- UUID (run instance ID)
  workflow_id TEXT NOT NULL,              -- FK to workflows
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,                      -- NULL until finished
  results TEXT                            -- JSON with final results
);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id, started_at DESC);
```

### Workflow Steps Table

```sql
CREATE TABLE workflow_steps (
  id TEXT PRIMARY KEY,                    -- UUID (step execution record)
  run_id TEXT NOT NULL,                   -- FK to workflow_runs
  step_id TEXT NOT NULL,                  -- Node ID from workflow definition
  agent_id TEXT,                          -- Agent that executed it (or null for mock)
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'success', 'failed'
  output TEXT,                            -- JSON step output
  error TEXT,                             -- Error message if failed
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_workflow_steps_run ON workflow_steps(run_id, step_id);
```

### WorkflowDefinition Type Structure

```typescript
interface WorkflowDefinition {
  nodes: Array<{
    id: string; // Node identifier
    type: string; // 'agent', 'condition', 'parallel', 'delay', 'custom'
    data: {
      agentId?: string; // "did:vaultys:..." or "@mock-agent"
      params?: Record<string, any>; // Parameters for the node
      expression?: string; // For condition nodes
      duration?: number; // For delay nodes
      [key: string]: unknown;
    };
    position?: { x: number; y: number }; // For UI visualization
  }>;
  edges: Array<{
    id: string;
    source: string; // Source node ID
    target: string; // Target node ID
    data?: {
      condition?: string; // Conditional routing
      [key: string]: unknown;
    };
  }>;
}
```

### Workflow Database Functions (lib/db.ts)

```typescript
// Queries
getWorkflow(id)                     // Single workflow by ID
listWorkflows(createdBy?)           // All workflows (optionally filtered by creator)
getWorkflowRun(id)                  // Single run
getWorkflowRunSteps(runId)          // All steps in a run
getWorkflowRunHistory(runId)        // Run + steps together

// Mutations
saveWorkflow(name, definition, createdBy) // Create → returns ID
updateWorkflow(id, name?, definition?)    // Update
deleteWorkflow(id)                        // Delete
startWorkflowRun(workflowId)             // Create run → returns runId
updateWorkflowRunStatus(runId, status, results)
recordWorkflowStep(runId, stepId, agentId, status, output, error)
updateWorkflowStep(stepId, status?, output?, error?)
```

### Workflow API Endpoints

| Endpoint                              | Method | Purpose                                            |
| ------------------------------------- | ------ | -------------------------------------------------- |
| `/api/workflows`                      | GET    | List all workflows (supports `?createdBy=` filter) |
| `/api/workflows`                      | POST   | Create new workflow                                |
| `/api/workflows/[id]`                 | GET    | Get workflow detail (includes full definition)     |
| `/api/workflows/[id]`                 | PATCH  | Update workflow                                    |
| `/api/workflows/[id]`                 | DELETE | Delete workflow                                    |
| `/api/workflows/[id]/execute`         | POST   | Start a new run (async)                            |
| `/api/workflows/[id]/export`          | GET    | Export workflow as JSON                            |
| `/api/workflows/import`               | POST   | Import workflow from JSON                          |
| `/api/workflows/runs/[runId]/status`  | GET    | Get run execution status                           |
| `/api/workflows/runs/[runId]/history` | GET    | Get run history with all steps                     |

### Workflow Templates

Pre-built templates are defined in [lib/workflow-templates.ts](lib/workflow-templates.ts):

- Content Creation Workflow
- Multi-Agent Report Generation
- Conditional Decision Tree Workflow
- Data Processing Pipeline
- (+ more templates available)

---

## 5. WORKFLOW EXECUTION ARCHITECTURE

### Workflow Executor (lib/workflow-executor.ts)

The executor handles:

1. **DAG Validation** — Topological sort to detect cycles
2. **Step Recording** — Creates DB entries for each node execution
3. **Parameter Interpolation** — Supports `${stepId.output.fieldName}` syntax
4. **Dependency Resolution** — Ensures dependencies are met before execution
5. **Condition Evaluation** — Supports conditional branching
6. **Context Management** — Tracks step outputs for downstream use

### Execution Flow

```
1. Parse workflow definition
2. Topological sort nodes (detect cycles)
3. Initialize execution context
4. Create DB step records for all nodes
5. For each node in execution order:
   - Check if dependencies are met
   - Interpolate params with upstream outputs
   - Execute step (currently mock only)
   - Update DB with step status/output
6. Mark workflow run as completed/failed
```

### Current Limitation: Mock Agent Execution Only

```typescript
// Only this is implemented:
if (agentId === "@mock-agent") {
  // Simulate async work with configurable duration
  await new Promise((resolve) => setTimeout(resolve, duration));
  // Return mock output
}

// Real agent execution is NOT YET IMPLEMENTED:
// - No agent lookup by DID
// - No WebSocket message sending
// - No agent response handling
// - No timeout/error recovery
```

---

## 6. ⚠️ CRITICAL GAP: WORKFLOWS NOT INTEGRATED WITH WORKSPACES

### Current State

**Workflows have NO workspace association:**

- ❌ No `workspace_id` column in workflows table
- ❌ No workspace-based filtering in workflow endpoints
- ❌ No access control (who can create/view/execute workflows)
- ❌ No workspace-specific workflow discovery
- ❌ No indication which agents are available in a workflow's workspace

### What This Means

1. **Workflows are Global** — Not scoped to any workspace
2. **Agent Selection is Manual** — No automatic filtering by workspace
3. **No Workspace-Based Access Control** — Can't restrict workflows to workspaces
4. **Agent Availability Unknown** — No verification agents belong to workflow's workspace

### Required Integrations for MVP

**To associate workflows with workspaces:**

1. Add `workspace_id` column to workflows table
2. Filter workflows by workspace in API endpoints
3. Add workspace-based access control checks
4. Filter available agents by workspace membership in workflow execution

**To enable real agent execution:**

1. Implement agent lookup by DID (from WebSocket server or DB)
2. Send task messages to agents via WebSocket
3. Handle agent responses and timeout scenarios
4. Track token usage per agent/workspace
5. Support fallback agents if primary is unavailable

---

## 7. DEMO SEEDING DATA

The system comes with realistic demo data (demo/seed.ts):

### 8 Enterprise Workspaces

| Workspace                   | Slug             | Default Capabilities                                  | Color   |
| ----------------------- | ---------------- | ----------------------------------------------------- | ------- |
| Engineering             | engineering      | code_execution, file_access, api_call                 | #6366f1 |
| Security Operations     | security-ops     | internet_access, api_call, system_command             | #ef4444 |
| DevOps & Infrastructure | devops           | code_execution, system_command, api_call, file_access | #f59e0b |
| Finance & Compliance    | finance          | file_access, api_call                                 | #10b981 |
| Data & Analytics        | data             | code_execution, file_access, api_call                 | #8b5cf6 |
| Customer Success        | customer-success | api_call, mail_send                                   | #06b6d4 |
| Legal & Audit           | legal            | file_access, api_call                                 | #64748b |
| Product                 | product          | api_call, internet_access                             | #f97316 |

### Agent Distribution

- **~500 total agents** across workspaces
- Each workspace has 8+ agent archetypes (e.g., Engineering has: code-review, test-runner, docs-writer, pr-assistant, etc.)
- Each agent has specific capabilities matching workspace specialization
- **~400 agent peer-grants** — cross-workspace delegation edges
- **~200 user grants** — user → agent permissions

### Users & Organization

- **~80 users** with realistic org hierarchy
- Reports-to relationships (manager chains)
- Various roles (members, admins, owners)
- Distributed across workspaces

---

## 8. KEY TAKEAWAYS & RECOMMENDATIONS

### What's Already Built ✅

1. **Multi-workspace architecture** with proper schema
2. **Agent registry** with capability tracking
3. **Workflow definition & execution engine** (mock agents)
4. **Token usage tracking** per agent and workspace
5. **Comprehensive database schema** with proper indexing
6. **API endpoints** for most CRUD operations

### What Needs to Be Added ⚠️

1. **Workspace-workflow association** (schema + APIs)
2. **Real agent execution** in workflows (not just mock)
3. **Agent availability filtering** by workspace in workflow UX
4. **Workspace-based access control** for workflows
5. **Agent-to-agent communication** for cross-workspace delegation
6. **Workflow result persistence** and history

### Architecture Strengths 💪

- Clean separation: workspaces, agents, users, workflows are all independent
- Proper foreign key relationships with CASCADE deletes
- Indexes on frequently-queried columns
- JSON storage for flexible configs (LLM, capabilities)
- Audit trails (created_at, updated_at, last_seen)

### For Integration with Agents in Workflows

1. **Agent lookup:** Use `getWSServer().getAgent(agentDid)` from [lib/ws-server.ts](lib/ws-server.ts)
2. **Agent list:** `GET /api/agents?workspace=[id]` — needs filtering implementation
3. **Real execution:** Implement agent message protocol (WebSocket RPC)
4. **Workspace scoping:** Add workflow filtering by user's workspace membership
