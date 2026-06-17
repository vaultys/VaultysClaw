import { prisma } from "./client";
import type {
  Workflow,
  WorkflowRun,
  WorkflowStep,
  WorkflowApproval,
  Prisma,
} from "@prisma/client";

export class WorkflowDAO {
  // ─── Workflows ──────────────────────────────────────────────────────────────

  static async create(
    name: string,
    definition: Prisma.InputJsonValue,
    createdBy?: string,
    realmId?: string,
    description?: string
  ): Promise<string> {
    const id = crypto.randomUUID();
    const defaultRealm = realmId
      ? null
      : await prisma.realm.findFirst({ where: { isDefault: true } });
    await prisma.workflow.create({
      data: {
        id,
        name,
        description: description ?? null,
        definition: definition,
        createdBy: createdBy ?? null,
        realmId: realmId ?? defaultRealm?.id ?? null,
      },
    });
    return id;
  }

  static async findById(id: string): Promise<Workflow | null> {
    return prisma.workflow.findUnique({ where: { id } });
  }

  static async list(opts?: {
    createdBy?: string;
    realmId?: string;
  }): Promise<Workflow[]> {
    return prisma.workflow.findMany({
      where: {
        ...(opts?.createdBy && { createdBy: opts.createdBy }),
        ...(opts?.realmId && { realmId: opts.realmId }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      definition?: Prisma.InputJsonValue;
      realmId?: string;
    }
  ): Promise<void> {
    await prisma.workflow.update({
      where: { id },
      data: {
        realmId: data.realmId,
        name: data.name,
        description: data.description,
        definition: data.definition,
      },
    });
  }

  static async setSchedule(
    id: string,
    cron: string | null,
    enabled: boolean,
    nextRun: string | null
  ): Promise<void> {
    await prisma.workflow.update({
      where: { id },
      data: {
        scheduleCron: cron,
        scheduleEnabled: enabled,
        scheduleNextRun: nextRun ? new Date(nextRun) : null,
      },
    });
  }

  static async updateScheduleRun(
    id: string,
    nextRun: string | null
  ): Promise<void> {
    await prisma.workflow.update({
      where: { id },
      data: {
        scheduleLastRun: new Date(),
        scheduleNextRun: nextRun ? new Date(nextRun) : null,
      },
    });
  }

  static async getDueScheduled(): Promise<Workflow[]> {
    return prisma.workflow.findMany({
      where: {
        scheduleEnabled: true,
        scheduleCron: { not: null },
        scheduleNextRun: { not: null, lte: new Date() },
      },
    });
  }

  static async delete(id: string): Promise<void> {
    await prisma.workflow.delete({ where: { id } });
  }

  // ─── Runs ───────────────────────────────────────────────────────────────────

  static async startRun(workflowId: string): Promise<string> {
    const id = crypto.randomUUID();
    await prisma.workflowRun.create({ data: { id, workflowId } });
    return id;
  }

  static async findRun(id: string): Promise<WorkflowRun | null> {
    return prisma.workflowRun.findUnique({ where: { id } });
  }

  static async updateRunStatus(
    runId: string,
    status:
      | "running"
      | "completed"
      | "failed"
      | "waiting_approval"
      | "rejected",
    results?: Record<string, unknown>
  ): Promise<void> {
    const isTerminal = ["completed", "failed", "rejected"].includes(status);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: isTerminal ? new Date() : null,
        ...(results !== undefined && {
          results: results as Prisma.InputJsonValue,
        }),
      },
    });
  }

  static async queryRuns(opts: {
    workflowId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    sortBy?: "startedAt" | "completedAt";
    sortDir?: "asc" | "desc";
    /** When set, only return runs whose workflow belongs to one of these realms. */
    realmIds?: Set<string>;
  }): Promise<{
    runs: (WorkflowRun & { workflowName: string })[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const {
      workflowId,
      status,
      page = 1,
      pageSize = 20,
      sortBy = "startedAt",
      sortDir = "desc",
      realmIds,
    } = opts;

    const where: Prisma.WorkflowRunWhereInput = {
      ...(workflowId && { workflowId }),
      ...(status && { status }),
    };

    if (realmIds !== undefined) {
      if (realmIds.size === 0) {
        where.workflowId = { in: [] }; // user has no realms → no runs
      } else {
        where.workflow = { realmId: { in: Array.from(realmIds) } };
      }
    }
    const orderBy: Prisma.WorkflowRunOrderByWithRelationInput =
      sortBy === "completedAt"
        ? { completedAt: sortDir }
        : { startedAt: sortDir };

    const [total, rows] = await Promise.all([
      prisma.workflowRun.count({ where }),
      prisma.workflowRun.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { workflow: { select: { name: true } } },
      }),
    ]);

    const runs = rows.map((r) => ({
      ...r,
      workflowName: (r as any).workflow.name,
    }));
    return {
      runs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  static async recordStep(
    runId: string,
    stepId: string,
    agentId?: string,
    status = "pending",
    output?: unknown,
    error?: string
  ): Promise<string> {
    const id = crypto.randomUUID();
    await prisma.workflowStep.create({
      data: {
        id,
        runId,
        stepId,
        agentId: agentId ?? null,
        status,
        output:
          output !== undefined ? (output as Prisma.InputJsonValue) : undefined,
        error: error ?? null,
      },
    });
    return id;
  }

  static async updateStep(
    stepId: string,
    opts: { status?: string; output?: unknown; error?: string }
  ): Promise<void> {
    const now = new Date();
    const data: Prisma.WorkflowStepUpdateInput = {};
    if (opts.status !== undefined) {
      data.status = opts.status;
      if (["success", "completed", "failed"].includes(opts.status))
        data.completedAt = now;
      if (opts.status === "running") data.startedAt = now;
    }
    if (opts.output !== undefined)
      data.output = opts.output as Prisma.InputJsonValue;
    if (opts.error !== undefined) data.error = opts.error;
    if (Object.keys(data).length > 0) {
      await prisma.workflowStep.update({ where: { id: stepId }, data });
    }
  }

  static async getRunSteps(runId: string): Promise<WorkflowStep[]> {
    return prisma.workflowStep.findMany({
      where: { runId },
      orderBy: [{ startedAt: "asc" }],
    });
  }

  static async getRunHistory(runId: string): Promise<{
    run: WorkflowRun;
    workflow: Workflow | null;
    steps: Array<
      WorkflowStep & {
        assignedUserId: string | null;
        assignedUserName: string | null;
        assignedUserEmail: string | null;
      }
    >;
  } | null> {
    const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
    if (!run) return null;
    const workflow = await prisma.workflow.findUnique({
      where: { id: run.workflowId },
    });
    const steps = await prisma.workflowStep.findMany({
      where: { runId },
      orderBy: [{ startedAt: "asc" }],
    });
    const approvals = await prisma.workflowApproval.findMany({
      where: { runId },
    });

    const enriched = await Promise.all(
      steps.map(async (step) => {
        const approval =
          approvals.find((a) => a.stepId === step.stepId) ?? null;
        let assignedUserName: string | null = null;
        let assignedUserEmail: string | null = null;
        if (approval?.assignedUserId) {
          const user = await prisma.user.findUnique({
            where: { did: approval.assignedUserId },
            select: { name: true, email: true },
          });
          assignedUserName = user?.name ?? null;
          assignedUserEmail = user?.email ?? null;
        }
        return {
          ...step,
          assignedUserId: approval?.assignedUserId ?? null,
          assignedUserName,
          assignedUserEmail,
        };
      })
    );

    return { run, workflow, steps: enriched };
  }

  // ─── Approvals ──────────────────────────────────────────────────────────────

  static async createApproval(opts: {
    runId: string;
    stepId: string;
    workflowId: string;
    workflowName: string;
    nodeMessage?: string;
    stepInput?: string;
    assignedUserId: string;
    mode: "approval" | "notification";
  }): Promise<string> {
    const id = crypto.randomUUID();
    await prisma.workflowApproval.create({
      data: {
        id,
        ...opts,
        nodeMessage: opts.nodeMessage ?? null,
        stepInput: opts.stepInput ?? null,
        status: opts.mode === "notification" ? "notified" : "pending",
      },
    });
    return id;
  }

  static async getPendingApprovalsForUser(
    userDid: string
  ): Promise<WorkflowApproval[]> {
    return prisma.workflowApproval.findMany({
      where: {
        assignedUserId: userDid,
        status: { in: ["pending", "notified"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getAllApprovalsForUser(
    userDid: string
  ): Promise<WorkflowApproval[]> {
    return prisma.workflowApproval.findMany({
      where: { assignedUserId: userDid },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findApproval(id: string): Promise<WorkflowApproval | null> {
    return prisma.workflowApproval.findUnique({ where: { id } });
  }

  static async getApprovalsForRun(runId: string): Promise<WorkflowApproval[]> {
    return prisma.workflowApproval.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async resolveApproval(
    approvalId: string,
    decidedBy: string,
    decision: "approved" | "rejected",
    comment?: string
  ): Promise<boolean> {
    const result = await prisma.workflowApproval.updateMany({
      where: { id: approvalId, status: "pending" },
      data: {
        status: decision,
        decidedAt: new Date(),
        decidedBy,
        comment: comment ?? null,
      },
    });
    return result.count > 0;
  }

  static async dismissNotification(
    approvalId: string,
    userDid: string
  ): Promise<boolean> {
    const result = await prisma.workflowApproval.updateMany({
      where: { id: approvalId, assignedUserId: userDid, mode: "notification" },
      data: { status: "dismissed" },
    });
    return result.count > 0;
  }
}
