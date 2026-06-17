/**
 * Inngest engine wiring (P1 spike) — bridge + route branching.
 *
 * Covers the engine-gating glue without a running Inngest server:
 *   - emitApprovalResolved(): no-op unless the Inngest engine is selected; emits
 *     the correct `workflow/approval.resolved` event otherwise; swallows errors.
 *   - POST /api/workflows/[id]/execute: hands off to inngest.send() when the
 *     engine is selected, else runs the legacy executeWorkflow().
 *
 * The Inngest client is mocked here so we can spy on send() and toggle the engine.
 * The durable function itself is tested separately in inngest-run-workflow.test.ts
 * (which needs the *real* client).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
  isInngestEngine: vi.fn(),
  EVT_RUN_REQUESTED: "workflow/run.requested",
  EVT_APPROVAL_RESOLVED: "workflow/approval.resolved",
}));

vi.mock("@/db", () => ({
  WorkflowDAO: {
    findById: vi.fn(),
    startRun: vi.fn(),
    findApproval: vi.fn(),
  },
}));

vi.mock("@/lib/auth-utils", () => ({ getAuthContext: vi.fn() }));
// executeWorkflow returns a promise — the legacy route calls .catch() on it.
vi.mock("@/lib/workflow-executor", () => ({
  executeWorkflow: vi.fn(async () => undefined),
}));

import { inngest, isInngestEngine } from "@/lib/inngest/client";
import { WorkflowDAO } from "@/db";
import { getAuthContext } from "@/lib/auth-utils";
import { executeWorkflow } from "@/lib/workflow-executor";
import { emitApprovalResolved } from "@/lib/inngest/emit-approval";
import { POST as executeRoute } from "@/app/api/workflows/[id]/execute/route";

const mockSend = inngest.send as ReturnType<typeof vi.fn>;
const mockIsInngest = isInngestEngine as ReturnType<typeof vi.fn>;
const mockFindApproval = WorkflowDAO.findApproval as ReturnType<typeof vi.fn>;
const mockFindById = WorkflowDAO.findById as ReturnType<typeof vi.fn>;
const mockStartRun = WorkflowDAO.startRun as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as ReturnType<typeof vi.fn>;
const mockExecuteWorkflow = executeWorkflow as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("emitApprovalResolved", () => {
  it("is a no-op when the Inngest engine is not selected", async () => {
    mockIsInngest.mockReturnValue(false);
    await emitApprovalResolved("ap-1", "approved", "user-1");
    expect(mockFindApproval).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("emits workflow/approval.resolved with run + step ids when engine selected", async () => {
    mockIsInngest.mockReturnValue(true);
    mockFindApproval.mockResolvedValue({
      id: "ap-1",
      runId: "run-1",
      stepId: "node-u",
    });

    await emitApprovalResolved("ap-1", "approved", "user-1", "looks good");

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      name: "workflow/approval.resolved",
      data: {
        runId: "run-1",
        stepId: "node-u",
        approvalId: "ap-1",
        decision: "approved",
        decidedBy: "user-1",
        comment: "looks good",
      },
    });
  });

  it("does not emit when the approval record is missing", async () => {
    mockIsInngest.mockReturnValue(true);
    mockFindApproval.mockResolvedValue(null);
    await emitApprovalResolved("ap-x", "rejected", "user-1");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("swallows send() failures so the HTTP response is unaffected", async () => {
    mockIsInngest.mockReturnValue(true);
    mockFindApproval.mockResolvedValue({ id: "ap-1", runId: "r", stepId: "s" });
    mockSend.mockRejectedValueOnce(new Error("server down"));
    await expect(
      emitApprovalResolved("ap-1", "approved", "user-1")
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/workflows/[id]/execute — engine branching", () => {
  const req = (body: unknown = {}) =>
    ({ json: async () => body }) as unknown as Request;
  const params = Promise.resolve({ id: "wf-1" });

  beforeEach(() => {
    mockGetAuth.mockResolvedValue({
      canAccessRealm: vi.fn().mockResolvedValue(true),
    });
    mockFindById.mockResolvedValue({
      id: "wf-1",
      realmId: null,
      definition: { nodes: [], edges: [] },
    });
    mockStartRun.mockResolvedValue("run-1");
  });

  it("hands off to Inngest when the durable engine is selected", async () => {
    mockIsInngest.mockReturnValue(true);

    const res: any = await executeRoute(req({ input: "hello" }) as any, {
      params,
    });

    expect(mockSend).toHaveBeenCalledWith({
      name: "workflow/run.requested",
      data: expect.objectContaining({
        runId: "run-1",
        workflowId: "wf-1",
        input: "hello",
      }),
    });
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
    expect(res._body).toEqual(
      expect.objectContaining({ success: true, runId: "run-1" })
    );
  });

  it("runs the legacy executor when the engine is not selected", async () => {
    mockIsInngest.mockReturnValue(false);

    await executeRoute(req({ input: "hello" }) as any, { params });
    // legacy path is fire-and-forget via a microtask — let it flush
    await new Promise((r) => setTimeout(r, 0));

    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
