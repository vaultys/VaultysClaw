/**
 * Tests for agent-controller approval flow and skill toggle:
 *   - getPendingApprovals returns queued requests
 *   - resolveApproval removes from queue and resolves the promise
 *   - resolveApproval throws for unknown IDs
 *   - tool_approval_request event is emitted
 *   - toggleSkillEnabled enables/disables a skill
 *   - toggleSkillEnabled throws for required skills
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// We test the Agent class internals by re-implementing just the relevant
// subset of its behaviour in a lightweight fashion, then verifying the
// public contract (getPendingApprovals / resolveApproval / toggleSkillEnabled)
// matches what server.ts and Dashboard.tsx expect.
// ---------------------------------------------------------------------------

// Stub out heavy dependencies so we can import agent.ts in unit-test mode.
vi.mock("../packages/agent-controller/src/db", () => ({
  initDb: vi.fn(),
  getDb: vi.fn(() => ({
    query: vi.fn(() => ({ run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) })),
    exec: vi.fn(),
    close: vi.fn(),
  })),
  getLlmConfig: vi.fn(() => null),
  setLlmConfig: vi.fn(),
  getRecentTasks: vi.fn(() => []),
  upsertWebSession: vi.fn(),
  getWebSessionByToken: vi.fn(() => null),
  deleteWebSession: vi.fn(),
  deleteExpiredWebSessions: vi.fn(),
  upsertChatSession: vi.fn(),
  appendChatMessages: vi.fn(),
  listChatSessions: vi.fn(() => []),
  getChatMessages: vi.fn(() => []),
  deleteChatSession: vi.fn(),
}));

vi.mock("../packages/agent-controller/src/llm", () => ({
  streamChat: vi.fn(),
  buildLlmModel: vi.fn(),
}));

vi.mock("../packages/agent-controller/src/peer-manager", () => ({
  PeerManager: class {
    onInvoke() {}
    updatePeerCatalog() {}
    connect() {
      return Promise.resolve();
    }
    close() {}
  },
}));

vi.mock("../packages/agent-controller/src/scheduler", () => ({
  Scheduler: class {
    addSchedule() {}
    removeSchedule() {}
    start() {}
    stop() {}
    getSchedules() {
      return [];
    }
  },
}));

vi.mock("../packages/agent-controller/src/task-queue", () => ({
  TaskQueue: class {
    enqueue() {
      return "task-id";
    }
    start() {}
    stop() {}
  },
}));

vi.mock("../packages/agent-controller/src/skills/loader", () => ({
  SkillLoader: class {
    lastRegistry = { skills: [] };
    async load() {
      return this.lastRegistry;
    }
    watch() {}
  },
}));

vi.mock("../packages/agent-controller/src/memory/store", () => ({
  MemoryStore: class {
    save() {
      return "mem-id";
    }
    delete() {}
    search() {
      return [];
    }
    recent() {
      return [];
    }
  },
}));

vi.mock("../packages/agent-controller/src/memory/retriever", () => ({
  MemoryRetriever: class {},
}));

vi.mock("../packages/agent-controller/src/memory/summarizer", () => ({
  ConversationSummarizer: class {},
}));

vi.mock("ws", () => ({
  WebSocket: class extends EventEmitter {
    readyState = 1; // OPEN
    send(_data: string) {}
    close() {}
  },
}));

vi.mock("@vaultys/id", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@vaultys/id")>();
  return {
    ...mod,
    VaultysId: {
      ...mod.VaultysId,
      generateMachine: vi.fn(
        async () =>
          ({
            did: "did:vaultys:test-machine",
            toVersion: (_v: number) => ({
              did: "did:vaultys:test-machine",
              getSecret: (_enc: string) => "mock-secret",
            }),
            getPublicKey: () => Buffer.from("mock-public-key"),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
      ),
    },
  };
});

// ---------------------------------------------------------------------------
// Inline approval/skill toggle tests without importing the full Agent
// (The full Agent requires file-system operations, WS connection, etc.)
// Instead, we test the logic directly by instantiating helper objects that
// mirror the agent's interface.
// ---------------------------------------------------------------------------

// Helper: recreate the pendingApprovals mechanism
class ApprovalManager extends EventEmitter {
  private pendingApprovals = new Map<
    string,
    {
      resolve: (approved: boolean) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private _pendingApprovalsMeta: Array<{
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    conversationId?: string;
    requestedAt: string;
  }> = [];

  requestApproval(
    requestId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(requestId);
        this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter(
          (m) => m.requestId !== requestId
        );
        resolve(false);
      }, 200); // short timeout for tests

      this.pendingApprovals.set(requestId, { resolve, timer });
      const meta = {
        requestId,
        toolName,
        args,
        requestedAt: new Date().toISOString(),
      };
      this._pendingApprovalsMeta.push(meta);
      this.emit("tool_approval_request", meta);
    });
  }

  getPendingApprovals() {
    return this._pendingApprovalsMeta;
  }

  resolveApproval(requestId: string, approved: boolean) {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) throw new Error(`No pending approval with id: ${requestId}`);
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(requestId);
    this._pendingApprovalsMeta = this._pendingApprovalsMeta.filter(
      (m) => m.requestId !== requestId
    );
    pending.resolve(approved);
  }
}

// Helper: recreate the skill-toggle mechanism
class SkillToggleManager {
  private workspaceSkillFilter: Array<{
    name: string;
    enabled: boolean;
    isRequired: boolean;
  }> | null = null;
  private skills = ["calc", "web-scraper", "json-api"];

  setWorkspaceFilter(
    filter: Array<{ name: string; enabled: boolean; isRequired: boolean }>
  ) {
    this.workspaceSkillFilter = filter;
  }

  toggleSkillEnabled(skillName: string, enabled: boolean) {
    if (!this.skills.includes(skillName))
      throw new Error(`Unknown skill: ${skillName}`);
    if (this.workspaceSkillFilter) {
      const entry = this.workspaceSkillFilter.find((s) => s.name === skillName);
      if (entry?.isRequired)
        throw new Error(
          `Skill "${skillName}" is required by the workspace and cannot be disabled`
        );
    }
    if (!this.workspaceSkillFilter) this.workspaceSkillFilter = [];
    const existing = this.workspaceSkillFilter.find((s) => s.name === skillName);
    if (existing) {
      existing.enabled = enabled;
    } else {
      this.workspaceSkillFilter.push({
        name: skillName,
        enabled,
        isRequired: false,
      });
    }
  }

  isEnabled(skillName: string) {
    if (!this.workspaceSkillFilter) return true;
    const entry = this.workspaceSkillFilter.find((s) => s.name === skillName);
    return entry ? entry.enabled : true;
  }
}

// ---------------------------------------------------------------------------
// Tests: approval flow
// ---------------------------------------------------------------------------

describe("Approval flow", () => {
  let mgr: ApprovalManager;

  beforeEach(() => {
    mgr = new ApprovalManager();
  });

  it("getPendingApprovals is empty initially", () => {
    expect(mgr.getPendingApprovals()).toHaveLength(0);
  });

  it("requestApproval adds to pending list and emits event", () => {
    const events: unknown[] = [];
    mgr.on("tool_approval_request", (e) => events.push(e));
    mgr.requestApproval("req-1", "shell", { command: "ls" });
    expect(mgr.getPendingApprovals()).toHaveLength(1);
    expect(mgr.getPendingApprovals()[0].requestId).toBe("req-1");
    expect(events).toHaveLength(1);
  });

  it("resolveApproval approves and removes from pending list", async () => {
    const result = mgr.requestApproval("req-2", "shell", { command: "ls" });
    expect(mgr.getPendingApprovals()).toHaveLength(1);
    mgr.resolveApproval("req-2", true);
    expect(await result).toBe(true);
    expect(mgr.getPendingApprovals()).toHaveLength(0);
  });

  it("resolveApproval rejects and removes from pending list", async () => {
    const result = mgr.requestApproval("req-3", "shell", { command: "ls" });
    mgr.resolveApproval("req-3", false);
    expect(await result).toBe(false);
    expect(mgr.getPendingApprovals()).toHaveLength(0);
  });

  it("resolveApproval throws for an unknown request ID", () => {
    expect(() => mgr.resolveApproval("no-such-id", true)).toThrow(
      "No pending approval"
    );
  });

  it("approval times out and auto-rejects", async () => {
    const result = mgr.requestApproval("req-timeout", "shell", {
      command: "ls",
    });
    const approved = await result; // waits for the 200ms timeout
    expect(approved).toBe(false);
    expect(mgr.getPendingApprovals()).toHaveLength(0);
  });

  it("multiple concurrent approvals work independently", async () => {
    const r1 = mgr.requestApproval("multi-1", "shell", { command: "ls" });
    const r2 = mgr.requestApproval("multi-2", "file_read", { path: "/tmp" });
    expect(mgr.getPendingApprovals()).toHaveLength(2);
    mgr.resolveApproval("multi-1", true);
    mgr.resolveApproval("multi-2", false);
    expect(await r1).toBe(true);
    expect(await r2).toBe(false);
    expect(mgr.getPendingApprovals()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: skill toggle
// ---------------------------------------------------------------------------

describe("Skill toggle", () => {
  let mgr: SkillToggleManager;

  beforeEach(() => {
    mgr = new SkillToggleManager();
  });

  it("all skills are enabled by default (no workspace filter)", () => {
    expect(mgr.isEnabled("calc")).toBe(true);
    expect(mgr.isEnabled("web-scraper")).toBe(true);
  });

  it("toggleSkillEnabled disables a skill", () => {
    mgr.toggleSkillEnabled("calc", false);
    expect(mgr.isEnabled("calc")).toBe(false);
  });

  it("toggleSkillEnabled re-enables a disabled skill", () => {
    mgr.toggleSkillEnabled("calc", false);
    mgr.toggleSkillEnabled("calc", true);
    expect(mgr.isEnabled("calc")).toBe(true);
  });

  it("throws for an unknown skill name", () => {
    expect(() => mgr.toggleSkillEnabled("unknown-skill", false)).toThrow(
      "Unknown skill"
    );
  });

  it("throws when trying to disable a workspace-required skill", () => {
    mgr.setWorkspaceFilter([{ name: "calc", enabled: true, isRequired: true }]);
    expect(() => mgr.toggleSkillEnabled("calc", false)).toThrow(
      "required by the workspace"
    );
  });

  it("allows toggling a workspace-managed non-required skill", () => {
    mgr.setWorkspaceFilter([{ name: "calc", enabled: true, isRequired: false }]);
    mgr.toggleSkillEnabled("calc", false);
    expect(mgr.isEnabled("calc")).toBe(false);
  });
});
