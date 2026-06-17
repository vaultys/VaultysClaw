/**
 * Durable workflow runner (P1 spike) — runWorkflow Inngest function.
 *
 * Drives the real durable function through @inngest/test (no server / DB needed):
 *   - sequential DAG runs to completion, one step.run per node
 *   - a failing node halts the run and marks it failed (downstream node skipped)
 *   - a user/approval node suspends on step.waitForEvent, then resumes on the
 *     approval event (approved → completed, rejected → rejected, timeout → continue)
 *
 * WorkflowDAO and executeStep are mocked; the DAG/topology/interpolation helpers
 * in workflow-executor stay real.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { InngestTestEngine } from "@inngest/test";

vi.mock("@/db", () => ({
  WorkflowDAO: {
    findById: vi.fn(),
    recordStep: vi.fn().mockResolvedValue("step-db-id"),
    updateRunStatus: vi.fn(),
    updateStep: vi.fn(),
    createApproval: vi.fn().mockResolvedValue("ap-1"),
  },
}));

// Keep the real DAG helpers; mock only the per-node executor.
vi.mock("@/lib/workflow-executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow-executor")>();
  return { ...actual, executeStep: vi.fn() };
});

import {
  runWorkflow,
  handleUserNode,
} from "@/lib/inngest/functions/run-workflow";
import { WorkflowDAO } from "@/db";
import { executeStep } from "@/lib/workflow-executor";

const mockFindById = WorkflowDAO.findById as ReturnType<typeof vi.fn>;
const mockUpdateRunStatus = WorkflowDAO.updateRunStatus as ReturnType<typeof vi.fn>;
const mockCreateApproval = WorkflowDAO.createApproval as ReturnType<typeof vi.fn>;
const mockExecuteStep = executeStep as ReturnType<typeof vi.fn>;

type Def = { nodes: any[]; edges: any[] };

function setWorkflow(definition: Def, realmId: string | null = null) {
  mockFindById.mockResolvedValue({
    id: "wf-1",
    name: "Test Workflow",
    definition,
    realmId,
  });
}

const agentNode = (id: string) => ({
  id,
  type: "agent",
  data: { agentId: id, params: {} },
});

const runEvent = {
  name: "workflow/run.requested" as const,
  data: { runId: "run-1", workflowId: "wf-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  (WorkflowDAO.recordStep as ReturnType<typeof vi.fn>).mockResolvedValue("step-db-id");
  mockCreateApproval.mockResolvedValue("ap-1");
});

// ─────────────────────────────────────────────────────────────────────────────
describe("runWorkflow — sequential DAG", () => {
  it("runs every node and completes", async () => {
    setWorkflow({
      nodes: [agentNode("a"), agentNode("b")],
      edges: [{ id: "e1", source: "a", target: "b" }],
    });
    mockExecuteStep.mockResolvedValue({ success: true, output: { text: "ok" } });

    const t = new InngestTestEngine({ function: runWorkflow });
    const { result } = await t.execute({ events: [runEvent] });

    expect(result).toEqual({ status: "completed", nodes: 2 });
    expect(mockExecuteStep).toHaveBeenCalledTimes(2);
    expect(mockUpdateRunStatus).toHaveBeenCalledWith(
      "run-1",
      "completed",
      expect.objectContaining({ completedNodes: 2 })
    );
  });

  it("halts and marks failed when a node fails (downstream node skipped)", async () => {
    setWorkflow({
      nodes: [agentNode("a"), agentNode("b"), agentNode("c")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ],
    });
    mockExecuteStep
      .mockResolvedValueOnce({ success: true, output: {} }) // a
      .mockResolvedValueOnce({ success: false, error: "boom" }); // b fails

    const t = new InngestTestEngine({ function: runWorkflow });
    const { result } = await t.execute({ events: [runEvent] });

    expect(result).toMatchObject({ status: "failed", node: "b", error: "boom" });
    expect(mockExecuteStep).toHaveBeenCalledTimes(2); // c never ran
    expect(mockUpdateRunStatus).toHaveBeenCalledWith(
      "run-1",
      "failed",
      expect.objectContaining({ failedNode: "b" })
    );
  });

  it("fails fast when the workflow has a cycle", async () => {
    setWorkflow({
      nodes: [agentNode("a"), agentNode("b")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
      ],
    });

    const t = new InngestTestEngine({ function: runWorkflow });
    const { result } = await t.execute({ events: [runEvent] });

    expect(result).toMatchObject({ status: "failed", reason: "cycle" });
    expect(mockExecuteStep).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Approval gate — tested directly against handleUserNode with a fake `step`.
// (The InngestTestEngine resolves waitForEvent from matched incoming events; a
// hand-rolled step lets us drive the wait result deterministically, exercising
// the real createApproval / waiting_approval / decision logic.)
describe("handleUserNode — approval gate", () => {
  const meta = { runId: "run-1", workflowId: "wf-1", workflowName: "WF" };
  const userNode = (data: Record<string, unknown>) => ({
    id: "u",
    type: "user",
    data,
  });

  // Fake step: step.run executes its callback; waitForEvent returns a fixed value.
  const fakeStep = (waitResult: unknown) =>
    ({
      run: async (_id: string, fn: () => unknown) => fn(),
      sleep: async () => undefined,
      waitForEvent: async () => waitResult,
    }) as any;

  it("creates an approval, marks waiting, and returns approved", async () => {
    const step = fakeStep({ data: { decision: "approved" } });
    const result = await handleUserNode(
      userNode({ assignedUserId: "user-1", mode: "approval" }) as any,
      "u",
      meta,
      {},
      "step-db-id",
      step
    );

    expect(result).toBe("approved");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockUpdateRunStatus).toHaveBeenCalledWith("run-1", "waiting_approval");
  });

  it("returns rejected when the approver rejects", async () => {
    const step = fakeStep({ data: { decision: "rejected" } });
    const result = await handleUserNode(
      userNode({ assignedUserId: "user-1", mode: "approval" }) as any,
      "u",
      meta,
      {},
      "step-db-id",
      step
    );
    expect(result).toBe("rejected");
  });

  it("auto-approves when the wait times out (null event)", async () => {
    const step = fakeStep(null);
    const result = await handleUserNode(
      userNode({ assignedUserId: "user-1", mode: "approval" }) as any,
      "u",
      meta,
      {},
      "step-db-id",
      step
    );
    expect(result).toBe("approved");
  });

  it("skips (approved) with no assigned user and never creates an approval", async () => {
    const step = fakeStep(null);
    const result = await handleUserNode(
      userNode({ mode: "approval" }) as any,
      "u",
      meta,
      {},
      "step-db-id",
      step
    );
    expect(result).toBe("approved");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("notification mode creates a record but does not wait", async () => {
    const waitForEvent = vi.fn();
    const step = {
      run: async (_id: string, fn: () => unknown) => fn(),
      sleep: async () => undefined,
      waitForEvent,
    } as any;

    const result = await handleUserNode(
      userNode({ assignedUserId: "user-1", mode: "notification" }) as any,
      "u",
      meta,
      {},
      "step-db-id",
      step
    );

    expect(result).toBe("approved");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(waitForEvent).not.toHaveBeenCalled();
  });
});
