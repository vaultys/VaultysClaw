import {
  WorkspaceDetail,
  WorkspaceWithCounts,
  UserWorkspaceWithWorkspace,
} from "@/lib/contracts";
import { prisma } from "./client";
import type {
  Workspace,
  WorkspaceTokenUsage,
  WorkspaceRouterKey,
  Prisma,
} from "@prisma/client";

export class WorkspaceDAO {
  static async findAll(userId?: string): Promise<WorkspaceWithCounts[]> {
    return prisma.workspace.findMany({
      where: userId ? { userWorkspaces: { some: { userId } } } : undefined,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            agentWorkspaces: true,
            userWorkspaces: true,
            workflows: true,
          },
        },
      },
    });
  }

  static async findById(id: string): Promise<Workspace | null> {
    return prisma.workspace.findUnique({ where: { id } });
  }

  /**
   * Full workspace detail (members, workflows, token usage) in a single query —
   * the payload backing GET /api/workspaces/:id (see `WorkspaceDetail`).
   */
  static async getDetail(id: string): Promise<WorkspaceDetail | null> {
    return prisma.workspace.findUnique({
      where: { id },
      include: {
        agentWorkspaces: {
          include: { agent: true, workspace: true },
          orderBy: [{ isPrimary: "desc" }, { agent: { name: "asc" } }],
        },
        userWorkspaces: {
          include: { user: true, workspace: true },
          orderBy: [{ isPrimary: "desc" }, { user: { name: "asc" } }],
        },
        workflows: true,
        tokenUsage: true,
      },
    });
  }

  static async findBySlug(slug: string): Promise<Workspace | null> {
    return prisma.workspace.findUnique({ where: { slug } });
  }

  static async findDefault(): Promise<Workspace | null> {
    return prisma.workspace.findFirst({ where: { isDefault: true } });
  }

  static async create(data: {
    name: string;
    slug: string;
    description?: string;
    color?: string;
  }): Promise<Workspace> {
    const id = crypto.randomUUID();
    return prisma.workspace.create({
      data: {
        id,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        color: data.color ?? "#6366f1",
      },
    });
  }

  /**
   * Creates a personal workspace for a user who has just joined (registered or
   * claimed their account via VaultysID) and enrolls them as its admin/primary
   * member. The workspace is named "<display>'s workspace" where <display> is
   * the user's name, falling back to their email, then their DID.
   */
  static async createPersonalWorkspace(
    userId: string
  ): Promise<Workspace | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const display =
      user.name?.trim() || user.email?.trim() || user.did || user.id;
    const name = `${display}'s workspace`;

    const baseSlug =
      display
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "workspace";
    let slug = baseSlug;
    for (let i = 2; await prisma.workspace.findUnique({ where: { slug } }); i++) {
      slug = `${baseSlug}-${i}`;
    }

    const workspace = await WorkspaceDAO.create({ name, slug });
    await WorkspaceDAO.addUserToWorkspace(userId, workspace.id, true, true);
    return workspace;
  }

  static async update(
    id: string,
    updates: Partial<{
      name: string;
      slug: string;
      description: string | null;
      color: string;
      llmConfig: Prisma.InputJsonValue | null;
      defaultCapabilities: Prisma.InputJsonValue;
      tokenBudgetDaily: number | null;
      tokenBudgetMonthly: number | null;
      allowedCapabilities: Prisma.InputJsonValue | null;
    }>
  ): Promise<void> {
    await prisma.workspace.update({
      where: { id },
      data: updates as Prisma.WorkspaceUpdateInput,
    });
  }

  static async delete(id: string): Promise<boolean> {
    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace || workspace.isDefault) return false;
    await prisma.workspace.delete({ where: { id } });
    return true;
  }

  static async setDefault(id: string): Promise<void> {
    await prisma.$transaction([
      prisma.workspace.updateMany({ data: { isDefault: false } }),
      prisma.workspace.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  // ─── Agent membership ───────────────────────────────────────────────────────

  static async getAgents(workspaceId: string) {
    return prisma.agentWorkspace.findMany({
      where: { workspaceId },
      include: {
        agent: true,
        workspace: true,
      },
      orderBy: [{ isPrimary: "desc" }, { agent: { name: "asc" } }],
    });
  }

  // ─── User membership ────────────────────────────────────────────────────────

  static async getUsers(workspaceId: string) {
    return prisma.userWorkspace.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, did: true, name: true, email: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { user: { name: "asc" } }],
    });
  }

  static async isUserInWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<boolean> {
    const row = await prisma.userWorkspace.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    return row !== null;
  }

  static async isUserWorkspaceAdmin(
    userId: string,
    workspaceId: string
  ): Promise<boolean> {
    const row = await prisma.userWorkspace.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    return row?.isWorkspaceAdmin ?? false;
  }

  static async setUserWorkspaceAdmin(
    userId: string,
    workspaceId: string,
    isAdmin: boolean
  ): Promise<boolean> {
    const result = await prisma.userWorkspace.updateMany({
      where: { userId, workspaceId },
      data: { isWorkspaceAdmin: isAdmin },
    });
    return result.count > 0;
  }

  static async addUserToWorkspace(
    userId: string,
    workspaceId: string,
    isPrimary = false,
    isWorkspaceAdmin = false
  ): Promise<void> {
    if (isPrimary) {
      await prisma.userWorkspace.updateMany({
        where: { userId },
        data: { isPrimary: false },
      });
    }
    await prisma.userWorkspace.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      create: { userId, workspaceId, isPrimary, isWorkspaceAdmin },
      update: { isPrimary, isWorkspaceAdmin },
    });
  }

  static async removeUserFromWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<boolean> {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (workspace?.isDefault) return false;
    const result = await prisma.userWorkspace.deleteMany({
      where: { userId, workspaceId },
    });
    return result.count > 0;
  }

  static async getUserWorkspaces(userId: string): Promise<UserWorkspaceWithWorkspace[]> {
    return prisma.userWorkspace.findMany({
      where: { userId },
      include: {
        workspace: true,
      },
      orderBy: [{ isPrimary: "desc" }, { workspace: { name: "asc" } }],
    });
  }

  static async enrollInDefault(
    type: "agent" | "user",
    did: string
  ): Promise<void> {
    const workspace = await WorkspaceDAO.findDefault();
    if (!workspace) return;
    if (type === "agent") {
      const { AgentDAO } = await import("./agent.dao");
      await AgentDAO.addToWorkspace(did, workspace.id, true);
    } else {
      await WorkspaceDAO.addUserToWorkspace(did, workspace.id, true);
    }
  }

  // ─── Token usage ────────────────────────────────────────────────────────────

  static async getTokenUsage(workspaceId: string): Promise<WorkspaceTokenUsage | null> {
    return prisma.workspaceTokenUsage.findUnique({ where: { workspaceId } });
  }

  static async upsertTokenUsage(
    workspaceId: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<void> {
    await prisma.workspaceTokenUsage.upsert({
      where: { workspaceId },
      create: { workspaceId, promptTokens, completionTokens },
      update: { promptTokens, completionTokens, updatedAt: new Date() },
    });
  }

  // ─── Router keys ────────────────────────────────────────────────────────────

  static async getRouterKey(workspaceId: string): Promise<WorkspaceRouterKey | null> {
    return prisma.workspaceRouterKey.findUnique({ where: { workspaceId } });
  }

  static async upsertRouterKey(
    workspaceId: string,
    data: {
      litellmVirtualKey?: string;
      allowedModelIds?: string[];
      monthlyBudgetUsd?: number | null;
    }
  ): Promise<void> {
    await prisma.workspaceRouterKey.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        litellmVirtualKey: data.litellmVirtualKey ?? null,
        allowedModelIds: data.allowedModelIds ?? [],
        monthlyBudgetUsd: data.monthlyBudgetUsd ?? null,
      },
      update: {
        ...(data.litellmVirtualKey !== undefined && {
          litellmVirtualKey: data.litellmVirtualKey,
        }),
        ...(data.allowedModelIds !== undefined && {
          allowedModelIds: data.allowedModelIds,
        }),
        ...(data.monthlyBudgetUsd !== undefined && {
          monthlyBudgetUsd: data.monthlyBudgetUsd,
        }),
        updatedAt: new Date(),
      },
    });
  }

  static async deleteRouterKey(workspaceId: string): Promise<void> {
    await prisma.workspaceRouterKey.delete({ where: { workspaceId } }).catch(() => {}); // ignore if not found
  }
}
