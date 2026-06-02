/**
 * Tests for the agent-controller web server:
 *   - Skill toggle endpoint (PUT /api/skills/:name/enabled)
 *   - Tool approval endpoints (GET /api/approvals, POST /api/approvals/:id/resolve)
 *   - Basic API authentication guard
 *   - Schedule create/delete
 *   - Task enqueue
 *   - Memory CRUD
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import http from "http";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Minimal mock Agent
// ---------------------------------------------------------------------------

const mockInfo = {
  id: "did:vaultys:test",
  name: "Test Agent",
  status: "connected",
  capabilities: ["file_access"],
  uptime: 10,
  lastHeartbeat: null,
  version: "0.0.1",
};

function makeApprovalEntry(requestId = "req-1") {
  return {
    requestId,
    toolName: "shell",
    args: { command: "ls" },
    conversationId: undefined,
    requestedAt: new Date().toISOString(),
  };
}

class MockAgent extends EventEmitter {
  getInfo() {
    return mockInfo;
  }
  getVaultysId() {
    return null;
  }
  getDid() {
    return "did:vaultys:test";
  }
  getPeerjsServer() {
    return undefined;
  }
  getLlmConfigSafe() {
    return null;
  }
  getActiveLlmConfig() {
    return null;
  }
  getToolList() {
    return [];
  }
  getSkills() {
    return [];
  }
  getToolLog() {
    return [];
  }
  getRecentTasks() {
    return [];
  }
  getSchedules() {
    return [];
  }
  getMemories() {
    return [];
  }
  saveMemory(_opts: unknown) {
    return "mem-1";
  }
  deleteMemory(_id: string) {}
  enqueueTask(_action: string, _params: unknown, _opts?: unknown) {
    return "task-1";
  }
  upsertSchedule(_s: unknown) {}
  removeSchedule(_id: string) {}
  invokeTool(_name: string, _args: unknown) {
    return Promise.resolve({ result: "ok" });
  }
  getWebChatToolSet() {
    return {};
  }
  async updateLlmConfig(_cfg: unknown) {}

  // New: pending approvals
  private _approvals: ReturnType<typeof makeApprovalEntry>[] = [];
  getPendingApprovals() {
    return this._approvals;
  }
  addApproval(a: ReturnType<typeof makeApprovalEntry>) {
    this._approvals.push(a);
    this.emit("tool_approval_request", a);
  }
  resolveApproval(requestId: string, _approved: boolean) {
    const idx = this._approvals.findIndex((a) => a.requestId === requestId);
    if (idx === -1)
      throw new Error(`No pending approval with id: ${requestId}`);
    this._approvals.splice(idx, 1);
  }

  // New: skill toggle
  private _disabledSkills = new Set<string>();
  toggleSkillEnabled(skillName: string, enabled: boolean) {
    if (skillName === "required-skill")
      throw new Error(`Skill "required-skill" is required`);
    if (enabled) this._disabledSkills.delete(skillName);
    else this._disabledSkills.add(skillName);
  }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

let server: http.Server;
let baseUrl: string;
let agent: MockAgent;
let sessionCookie: string;

beforeAll(async () => {
  // We import and start the web server with our mock agent.
  // To avoid DB initialization we dynamically stub the DB imports.
  vi.mock("../packages/agent-controller/src/db", () => ({
    upsertWebSession: vi.fn(),
    getWebSessionByToken: vi.fn(() => ({
      did: "did:vaultys:test",
      created_at: Date.now(),
    })),
    deleteWebSession: vi.fn(),
    deleteExpiredWebSessions: vi.fn(),
    upsertChatSession: vi.fn(),
    appendChatMessages: vi.fn(),
    listChatSessions: vi.fn(() => []),
    getChatMessages: vi.fn(() => []),
    deleteChatSession: vi.fn(),
  }));

  const { startWebServer } =
    await import("../packages/agent-controller/src/web/server");
  agent = new MockAgent();

  // Use a random high port
  const port = 19000 + Math.floor(Math.random() * 1000);
  server = startWebServer({ port, agent: agent as any });
  baseUrl = `http://127.0.0.1:${port}`;

  // Wait for server to be ready
  await new Promise<void>((resolve) => {
    server.on("listening", resolve);
    // May already be listening
    if (server.listening) resolve();
  });

  // The mock getWebSessionByToken returns a valid session, so any vc_session cookie works.
  sessionCookie = "vc_session=valid-token";
});

afterAll(() => {
  server?.close();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiGet(path: string, auth = true) {
  return fetch(`${baseUrl}${path}`, {
    headers: auth ? { cookie: sessionCookie } : {},
  });
}

async function apiPost(path: string, body: unknown, auth = true) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { cookie: sessionCookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function apiPut(path: string, body: unknown, auth = true) {
  return fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { cookie: sessionCookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe("API auth guard", () => {
  it("returns 401 for protected endpoints without a session cookie", async () => {
    const res = await apiGet("/api/tools", false);
    expect(res.status).toBe(401);
  });

  it("allows requests with a valid session cookie", async () => {
    const res = await apiGet("/api/tools");
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Agent info
// ---------------------------------------------------------------------------

describe("GET /api/info", () => {
  it("returns agent info without auth", async () => {
    const res = await apiGet("/api/info", false);
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof mockInfo;
    expect(body.name).toBe("Test Agent");
  });
});

// ---------------------------------------------------------------------------
// Tool approval endpoints
// ---------------------------------------------------------------------------

describe("Tool approval API", () => {
  beforeEach(() => {
    // Clear approvals between tests
    (agent as any)._approvals = [];
  });

  it("GET /api/approvals returns empty list initially", async () => {
    const res = await apiGet("/api/approvals");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approvals: unknown[] };
    expect(body.approvals).toEqual([]);
  });

  it("GET /api/approvals returns pending approvals", async () => {
    agent.addApproval(makeApprovalEntry("req-42"));
    const res = await apiGet("/api/approvals");
    const body = (await res.json()) as {
      approvals: Array<{ requestId: string }>;
    };
    expect(body.approvals).toHaveLength(1);
    expect(body.approvals[0].requestId).toBe("req-42");
  });

  it("POST /api/approvals/:id/resolve approves a pending request", async () => {
    agent.addApproval(makeApprovalEntry("req-approve"));
    const res = await apiPost("/api/approvals/req-approve/resolve", {
      approved: true,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // Should now be gone
    expect(agent.getPendingApprovals()).toHaveLength(0);
  });

  it("POST /api/approvals/:id/resolve rejects a pending request", async () => {
    agent.addApproval(makeApprovalEntry("req-reject"));
    const res = await apiPost("/api/approvals/req-reject/resolve", {
      approved: false,
    });
    expect(res.status).toBe(200);
    expect(agent.getPendingApprovals()).toHaveLength(0);
  });

  it("returns 404 when resolving a non-existent approval", async () => {
    const res = await apiPost("/api/approvals/does-not-exist/resolve", {
      approved: true,
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when approved is not a boolean", async () => {
    agent.addApproval(makeApprovalEntry("req-bad"));
    const res = await apiPost("/api/approvals/req-bad/resolve", {
      approved: "yes",
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Skill toggle endpoint
// ---------------------------------------------------------------------------

describe("Skill toggle API", () => {
  it("PUT /api/skills/:name/enabled disables a skill", async () => {
    const res = await apiPut("/api/skills/calculator/enabled", {
      enabled: false,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      skillName: string;
      enabled: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.skillName).toBe("calculator");
    expect(body.enabled).toBe(false);
  });

  it("PUT /api/skills/:name/enabled enables a skill", async () => {
    const res = await apiPut("/api/skills/calculator/enabled", {
      enabled: true,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
  });

  it("returns 400 when enabled is not a boolean", async () => {
    const res = await apiPut("/api/skills/calculator/enabled", {
      enabled: "yes",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the agent throws (e.g. required skill)", async () => {
    const res = await apiPut("/api/skills/required-skill/enabled", {
      enabled: false,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("required");
  });
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

describe("Task API", () => {
  it("POST /api/tasks enqueues a task", async () => {
    const res = await apiPost("/api/tasks", { action: "summarize" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; taskId: string };
    expect(body.ok).toBe(true);
    expect(body.taskId).toBe("task-1");
  });

  it("returns 400 when action is missing", async () => {
    const res = await apiPost("/api/tasks", {});
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

describe("Memory API", () => {
  it("GET /api/memory returns memories", async () => {
    const res = await apiGet("/api/memory");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memories: unknown[] };
    expect(Array.isArray(body.memories)).toBe(true);
  });

  it("POST /api/memory saves a memory", async () => {
    const res = await apiPost("/api/memory", {
      content: "test fact",
      type: "fact",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBe("mem-1");
  });

  it("returns 400 when content is missing", async () => {
    const res = await apiPost("/api/memory", { type: "fact" });
    expect(res.status).toBe(400);
  });
});
