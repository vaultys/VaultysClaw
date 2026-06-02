# VaultysClaw Codebase Exploration Summary

## 1. Workflow Runs API Response Structure

### GET `/api/workflow-runs` - List Workflow Runs

**Response Structure:**

```json
{
  "runs": [
    {
      "id": "uuid",
      "workflow_id": "uuid",
      "status": "running|completed|failed",
      "started_at": "ISO-8601 timestamp",
      "completed_at": "ISO-8601 timestamp | null",
      "results": "JSON string | null",
      "workflow_name": "string"
    }
  ],
  "total": number,
  "page": number,
  "pageSize": number,
  "totalPages": number
}
```

**Query Parameters:**

- `workflowId` (optional): Filter by workflow ID
- `status` (optional): Filter by status (running|completed|failed)
- `page` (default: 1): Page number
- `pageSize` (default: 20, max: 100): Items per page
- `sortBy` (default: startedAt): Sort by startedAt | completedAt
- `sortDir` (default: desc): Sort direction asc | desc

**TypeScript Interfaces:**

```typescript
export interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  results: string | null;
}

export interface WorkflowRunQueryResult {
  runs: (WorkflowRunRow & { workflow_name: string })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### GET `/api/workflow-runs/[id]` - Get Specific Workflow Run

**Response Structure:**

```json
{
  "run": {
    "id": "uuid",
    "workflow_id": "uuid",
    "status": "running|completed|failed",
    "started_at": "ISO-8601 timestamp",
    "completed_at": "ISO-8601 timestamp | null",
    "results": "JSON string | null"
  },
  "workflow": {
    "id": "uuid",
    "name": "string",
    "definition": { /* parsed WorkflowDefinition */ }
  } | null,
  "steps": [
    {
      "id": "uuid",
      "run_id": "uuid",
      "step_id": "string",
      "agent_id": "string | null",
      "status": "pending|running|success|failed",
      "output": "JSON string | null",
      "error": "string | null",
      "started_at": "ISO-8601 timestamp | null",
      "completed_at": "ISO-8601 timestamp | null",
      "assigned_user_id": "string | null",
      "assigned_user_name": "string | null",
      "assigned_user_email": "string | null"
    }
  ]
}
```

**TypeScript Interface:**

```typescript
export interface WorkflowStepWithUserRow extends WorkflowStepRow {
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_user_email: string | null;
}
```

---

## 2. Agent-Controller: How Agents Are Instantiated and Executed

### Agent Initialization

The `Agent` class (extends EventEmitter) is the main controller for agent execution. Initialization happens in the `start()` method:

```typescript
export class Agent extends EventEmitter {
  private config: AgentControllerConfig;
  private activeLlmConfig: LlmConfig | null = null;
  private toolRegistry: ToolRegistry;
  private taskQueue: TaskQueue | null = null;
  private scheduler: Scheduler | null = null;
  private peerManager: PeerManager | null = null;
  private memoryStore = new MemoryStore();

  constructor(config: AgentControllerConfig) {
    super();
    this.config = config;
    this.capabilities = config.requestedCapabilities;
    // Initial tool registry (no skill tools yet — will be updated after skills load)
    this.toolRegistry = createToolRegistry({
      workspaceRoot: config.workspaceRoot ?? process.cwd(),
    });
  }

  async start(): Promise<void> {
    this.log("info", `Initializing agent "${this.config.name}"`);

    // 1. Load or create VaultysId identity
    this.vaultysId = await this.loadOrCreateIdentity(this.config.vaultysIdPath);
    this.log("info", `VaultysId identity ready`, { did: this.vaultysId.did });

    // 2. Initialize SQLite database
    const dbDir = path.dirname(this.config.vaultysIdPath);
    const dbFileName = path.basename(this.config.vaultysIdPath, ".id") + ".db";
    initDb(dbDir, dbFileName);
    this.log("info", "Local database initialized");

    // 3. Load LLM configuration (from remote or env vars)
    await this.refreshActiveLlmConfig();

    // 4. Load skills
    await this.loadSkills();

    // 5. Initialize task queue and scheduler
    this.initTaskQueue();

    // 6. Initialize peer manager for agent-to-agent communication
    this.peerManager = new PeerManager(this.vaultysId);
    this.peerManager.onInvoke(async (remoteDid, action, params) => {
      return this.executeAction(action, params, remoteDid);
    });
  }
}
```

### Intent Execution Flow

When an agent receives an intent (action request), it executes through this flow:

```typescript
private async executeAction(action: string, params: Record<string, unknown>, _callerDid?: string): Promise<unknown> {
  if (!this.activeLlmConfig) throw new LlmNotConfiguredError();

  // 1. Build tool set filtered by agent's capabilities
  const tools = this.buildAgentToolSet();

  // 2. Retrieve memory context if available
  const queryText = `${action} ${JSON.stringify(params)}`;
  const memoryContext = this.memoryRetriever.retrieve(queryText) || undefined;

  // 3. Call LLM with action, params, and available tools
  const { text, usage } = await runIntent(
    this.activeLlmConfig,
    action,
    params,
    tools,
    memoryContext
  );

  // 4. Record token usage
  if (usage) {
    recordTokenUsage(
      usage.promptTokens,
      usage.completionTokens,
      this.activeLlmConfig.provider,
      this.activeLlmConfig.model
    );
    this._tokenUsageSinceLastSync.promptTokens += usage.promptTokens;
    this._tokenUsageSinceLastSync.completionTokens += usage.completionTokens;
  }

  return { text, usage };
}
```

### Tool System Integration

Tools are built per-request and filtered by capabilities:

```typescript
private buildAgentToolSet(conversationId?: string): Record<string, MastraTool> {
  // If no capabilities assigned (standalone mode), grant all tools
  const caps = this.capabilities.length > 0
    ? this.capabilities
    : this.toolRegistry.tools.map((t) => t.capability);

  const ts = buildToolSet(
    this.toolRegistry,
    caps as AgentCapability[],
    (request) => {
      return this.requestToolApproval(request, conversationId);
    }
  );

  // Append remote agent tools from peer catalog
  if (this.peerCatalog.length > 0 && this.peerManager) {
    const remoteTools = buildRemoteAgentTools(this.peerCatalog, this.peerManager);
    for (const def of remoteTools) {
      ts[def.name] = def.tool as MastraTool;
    }
  }

  this.log("debug", `buildAgentToolSet: caps=${JSON.stringify([...new Set(caps)])}, tools=${Object.keys(ts).join(",")}`);
  return ts;
}
```

---

## 3. LLM Configuration

### Where the LLM Provider is Set

The LLM configuration can come from three sources (in priority order):

1. **Remote encrypted config** (from control plane via WebSocket)
2. **Local config in SQLite** (persisted from control plane)
3. **Environment variables** (LLM_PROVIDER, LLM_MODEL, etc.)

```typescript
private async refreshActiveLlmConfig(): Promise<void> {
  // Prefer encrypted remote config; fall back to plaintext remote, then env vars.
  const remote = await this.loadDecryptedLlmConfig() ?? getLlmConfig();
  this.activeLlmConfig = remote ?? this.config.llmConfig;

  if (this.activeLlmConfig) {
    const source = remote ? "remote" : "env";
    this.log("info", `Active LLM config: ${this.activeLlmConfig.provider}/${this.activeLlmConfig.model} (${source})`);
    this.emit("config_updated", {
      source,
      provider: this.activeLlmConfig.provider,
      model: this.activeLlmConfig.model
    });
  } else {
    this.log("warn", "No LLM config — intents requiring LLM will fail");
  }
}
```

### LLM Configuration Type

```typescript
export interface LlmConfig {
  provider: "openai" | "anthropic" | "google" | "ollama" | "openai-compatible";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  maxTokens?: number;
  pricePerMillionInputTokens?: number;
  pricePerMillionOutputTokens?: number;
}
```

### Encryption/Decryption

API keys are encrypted at rest using the agent's VaultysId before writing to SQLite:

```typescript
private async persistEncryptedLlmConfig(config: LlmConfig | null): Promise<void> {
  if (config === null) {
    setLlmConfig(null); // clears both llm_config and llm_config_encrypted
    return;
  }

  const { apiKey, ...rest } = config;
  if (apiKey && this.vaultysId) {
    // Encrypt the apiKey for this agent's VaultysId only
    const encryptedApiKey = await VaultysId.encrypt(apiKey, [this.vaultysId.id]);
    const blob = JSON.stringify({ ...rest, encryptedApiKey, apiKeyEncrypted: true });
    setEncryptedLlmConfigBlob(blob);
  } else {
    // No apiKey to encrypt — store plaintext blob
    setEncryptedLlmConfigBlob(JSON.stringify({ ...rest }));
  }

  // Also update the plaintext slot (apiKey omitted) so getLlmConfig() still works
  setLlmConfig({ ...rest, apiKey: undefined });
}

private async loadDecryptedLlmConfig(): Promise<LlmConfig | null> {
  const raw = getEncryptedLlmConfigBlob();
  if (!raw) return null;

  try {
    type Blob = LlmConfig & { encryptedApiKey?: string; apiKeyEncrypted?: boolean };
    const stored = JSON.parse(raw) as Blob;
    const { encryptedApiKey, apiKeyEncrypted, ...rest } = stored;

    if (encryptedApiKey && apiKeyEncrypted && this.vaultysId) {
      const decrypted = (await this.vaultysId.decrypt(encryptedApiKey)) as string;
      return { ...rest, apiKey: decrypted } as LlmConfig;
    }

    return rest as LlmConfig;
  } catch {
    return null;
  }
}
```

---

## 4. Tool Call Resolution in LLM Integration

### How Tools are Passed to the LLM

Tools are passed to the Mastra Agent constructor via the `tools` parameter:

```typescript
export async function runIntent(
  config: LlmConfig,
  action: string,
  params: Record<string, unknown>,
  tools?: Record<string, MastraTool>,
  memoryContext?: string
): Promise<{
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}> {
  const model = buildModel(config);
  const base = config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const instructions = memoryContext ? `${base}\n\n${memoryContext}` : base;

  const hasParams = params && Object.keys(params).length > 0;
  const userMessage = hasParams
    ? `${action}\n\nAdditional context:\n${JSON.stringify(params, null, 2)}`
    : action;

  const hasTools = tools && Object.keys(tools).length > 0;

  logger.info(
    {
      provider: config.provider,
      model: config.model,
      action,
      toolCount: hasTools ? Object.keys(tools!).length : 0,
    },
    "Running intent"
  );

  try {
    const agent = new Agent({
      name: "vaultysclaw-intent",
      instructions,
      model,
      ...(hasTools ? { tools: tools as Record<string, MastraTool> } : {}),
    });

    const result = await agent.generate(userMessage, {
      maxSteps: 10,
      modelSettings: config.maxTokens
        ? { maxOutputTokens: config.maxTokens }
        : undefined,
    });

    logger.info(
      {
        action,
        steps: result.steps?.length ?? 0,
        finishReason: result.finishReason,
        textLength: result.text?.length ?? 0,
      },
      "Intent LLM response received"
    );

    return {
      text: result.text ?? "",
      usage: {
        promptTokens:
          result.usage?.promptTokens ?? result.usage?.inputTokens ?? 0,
        completionTokens:
          result.usage?.completionTokens ?? result.usage?.outputTokens ?? 0,
      },
    };
  } catch (err) {
    throw new LlmProviderError(config.provider, err);
  }
}
```

### Tool Building

The `buildToolSet` function filters available tools by capability and wraps them with approval gates:

```typescript
export function buildToolSet(
  registry: ToolRegistry,
  capabilities: AgentCapability[],
  approvalFn?: (request: ApprovalRequest) => Promise<boolean>
): Record<string, MastraTool> {
  const tools = registry.forCapabilities(capabilities);
  const toolMap: Record<string, MastraTool> = {};

  for (const toolDef of tools) {
    if (toolDef.requiresApproval && approvalFn) {
      // Wrap the tool with an approval gate
      toolMap[toolDef.name] = wrapToolWithApproval(
        toolDef.tool,
        toolDef.name,
        approvalFn
      );
    } else {
      toolMap[toolDef.name] = toolDef.tool;
    }
  }

  return toolMap;
}
```

### Tool Registry Structure

```typescript
export interface ToolRegistry {
  tools: ToolDefinition[];
  get(name: string): ToolDefinition | undefined;
  forCapabilities(caps: AgentCapability[]): ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  capability: AgentCapability;
  requiresApproval: boolean;
  tool: MastraTool;
}
```

---

## 5. Existing Testing Patterns and Mocking Strategies

### Test Organization

Tests are organized in `__tests__/` directory with separate files for different concerns:

- `workflows.test.ts` - Database and workflow execution tests
- `workflows-api.test.ts` - REST API endpoint tests
- `llm.test.ts` - LLM integration and configuration tests
- `tools.test.ts` - Tool registry and tool execution tests

### Mocking Strategy for LLM

The project mocks the `@mastra/core/agent` module to avoid real network calls:

```typescript
// From __tests__/llm.test.ts
const mockGenerate = vi.fn().mockResolvedValue({
  text: "mock LLM response",
  usage: { promptTokens: 15, completionTokens: 8 },
  steps: [],
  finishReason: "stop",
});

vi.mock("@mastra/core/agent", () => ({
  Agent: vi.fn().mockImplementation(() => ({
    generate: mockGenerate,
    stream: mockStream,
  })),
}));

describe("runIntent", () => {
  it("should call Agent.generate and return text + usage", async () => {
    const config = {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      apiKey: "sk-test",
    };

    const result = await runIntent(config, "summarise", {
      text: "hello world",
    });

    expect(result.text).toBe("mock LLM response");
    expect(result.usage.promptTokens).toBe(15);
    expect(result.usage.completionTokens).toBe(8);
    expect(mockGenerate).toHaveBeenCalledOnce();
  });

  it("should pass custom system prompt to Agent constructor", async () => {
    const config = {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      apiKey: "sk-test",
      systemPrompt: "Custom system instructions",
    };

    await runIntent(config, "translate", { lang: "fr", input: "Hello" });

    const agentCtor = vi.mocked(Agent);
    const ctorArgs = agentCtor.mock.calls[0][0] as any;
    expect(ctorArgs.instructions).toBe("Custom system instructions");
  });

  it("should wrap Agent.generate errors in LlmProviderError", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("Rate limit exceeded"));

    const config = {
      provider: "anthropic" as const,
      model: "claude-3-haiku-20240307",
    };
    await expect(runIntent(config, "ping", {})).rejects.toBeInstanceOf(
      LlmProviderError
    );
  });
});
```

### Database Testing Pattern

Tests use temporary SQLite databases initialized via `initDb()`:

```typescript
describe("Agent DB: getLlmConfig / setLlmConfig", () => {
  beforeEach(() => {
    const tmpDir = path.join(
      os.tmpdir(),
      `vc-llm-db-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    initDb(tmpDir);
  });

  afterEach(() => {
    closeDb();
  });

  it("should round-trip a full LlmConfig", () => {
    const cfg = {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      apiKey: "sk-db-test",
      systemPrompt: "Be helpful.",
      maxTokens: 1000,
    };
    setLlmConfig(cfg);
    expect(getLlmConfig()).toEqual(cfg);
  });
});
```

### Tool Testing Pattern

Tools are tested by importing them directly and calling their `execute()` method:

```typescript
describe("Tool Registry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry({ workspaceRoot: os.tmpdir() });
  });

  it("should create a registry with built-in tools", () => {
    expect(registry.tools.length).toBeGreaterThanOrEqual(5);
  });

  it("should filter tools by capabilities", () => {
    const fileTools = registry.forCapabilities(["file_access"]);
    expect(fileTools.length).toBe(3); // file_read, file_write, file_list

    const allNames = fileTools.map((t) => t.name);
    expect(allNames).toContain("file_read");
    expect(allNames).toContain("file_write");
    expect(allNames).toContain("file_list");
  });
});

describe("buildToolSet", () => {
  it("should wrap approved tools with an approval gate", async () => {
    const approvalFn = vi.fn().mockResolvedValue(true);
    const toolSet = buildToolSet(registry, ["code_execution"], approvalFn);

    expect(Object.keys(toolSet)).toContain("code_run");

    // Execute the tool and verify approval callback was called
    const result = await (toolSet.code_run as any).execute(
      { code: "1 + 1", timeoutMs: 5000 },
      {}
    );

    expect(approvalFn).toHaveBeenCalledOnce();
    expect(result.result).toBe("2");
  });
});
```

### Environment Variable Testing

Tests manipulate `process.env` to test configuration loading:

```typescript
describe("loadConfig", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    // Restore original env after each test
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it("should return null llmConfig when no LLM env vars are set", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    const config = loadConfig();
    expect(config.llmConfig).toBeNull();
  });

  it("should build a valid LlmConfig when both LLM_PROVIDER and LLM_MODEL are set", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_MODEL = "gpt-4o-mini";
    process.env.LLM_API_KEY = "sk-unit-test";
    const config = loadConfig();
    expect(config.llmConfig?.provider).toBe("openai");
    expect(config.llmConfig?.model).toBe("gpt-4o-mini");
    expect(config.llmConfig?.apiKey).toBe("sk-unit-test");
  });
});
```

### Workflow Database Testing

Tests the database layer for workflow operations:

```typescript
describe("Workflow Database Operations", () => {
  describe("saveWorkflow", () => {
    it("should create a new workflow and return an ID", () => {
      const definition: WorkflowDefinition = {
        nodes: [
          { id: "node-1", type: "agent", data: { agentId: "@mock-agent" } },
        ],
        edges: [],
      };

      const id = saveWorkflow("Test Workflow", definition, undefined);

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
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
  });
});
```

### Testing Patterns Summary

| Pattern                      | Usage                                                     |
| ---------------------------- | --------------------------------------------------------- |
| **Mock Mastra Agent**        | `vi.mock("@mastra/core/agent")` - Prevents real LLM calls |
| **Temporary DB**             | `initDb()` in beforeEach, `closeDb()` in afterEach        |
| **Environment manipulation** | Save/restore `process.env` for config tests               |
| **Direct tool execution**    | Import tool and call `.execute()` directly                |
| **Capability filtering**     | Test tool registry with different capability sets         |
| **Approval gates**           | Mock approval function and verify it's called             |
| **End-to-end workflow**      | Database → Function → Assertion chain                     |

---

## Key Takeaways for Testing

1. **LLM Testing**: Mock `@mastra/core/agent` to avoid network calls. The mock should return an object with `generate()` and `stream()` methods that return `{ text, usage }` and `{ textStream }` respectively.

2. **Configuration Testing**: The agent loads LLM config from three sources in priority: remote encrypted → local plaintext → environment variables. Test each source separately.

3. **Tool Testing**: Tools can be tested independently by importing them and calling `.execute()`. Approval gates are optional and can be mocked with `vi.fn()`.

4. **Database Pattern**: Create temporary SQLite databases in `beforeEach()` and clean up in `afterEach()` using `initDb(tmpDir)` and `closeDb()`.

5. **Response Structures**: API responses are paginated for list endpoints and include workflow_name in results. Single resource endpoints return the full object with parsed nested structures (e.g., definition is parsed from JSON string).
