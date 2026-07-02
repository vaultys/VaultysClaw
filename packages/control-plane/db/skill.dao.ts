import { prisma } from "./client";
import type {
  OrgSkill,
  WorkspaceSkill,
  AgentSkillOverride,
  Prisma,
} from "@prisma/client";
import type { SkillConfig } from "@vaultysclaw/shared";

export class OrgSkillDAO {
  static async findAll(): Promise<OrgSkill[]> {
    return prisma.orgSkill.findMany({ orderBy: { name: "asc" } });
  }

  static async findById(id: string): Promise<OrgSkill | null> {
    return prisma.orgSkill.findUnique({ where: { id } });
  }

  static async findByName(name: string): Promise<OrgSkill | null> {
    return prisma.orgSkill.findUnique({ where: { name } });
  }

  static async create(opts: {
    name: string;
    description?: string;
    version?: string;
    icon?: string;
    content?: string;
    configSchema?: Record<string, unknown>;
  }): Promise<OrgSkill> {
    const id = crypto.randomUUID();
    return prisma.orgSkill.create({
      data: {
        id,
        name: opts.name.trim(),
        description: opts.description?.trim() ?? null,
        version: opts.version?.trim() ?? "1.0.0",
        icon: opts.icon?.trim() ?? null,
        content: opts.content ?? null,
        configSchema: (opts.configSchema as Prisma.InputJsonValue) ?? {},
      },
    });
  }

  static async upsertBuiltIn(opts: {
    name: string;
    description: string;
    version: string;
    icon: string;
    content: string;
  }): Promise<void> {
    const id = crypto.randomUUID();
    await prisma.orgSkill.upsert({
      where: { name: opts.name },
      create: { id, ...opts, configSchema: {} },
      update: {},
    });
  }

  static async update(
    id: string,
    updates: {
      description?: string | null;
      version?: string;
      icon?: string | null;
      content?: string | null;
      configSchema?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const result = await prisma.orgSkill.updateMany({
      where: { id },
      data: {
        ...(updates.description !== undefined && {
          description: updates.description,
        }),
        ...(updates.version !== undefined && { version: updates.version }),
        ...(updates.icon !== undefined && { icon: updates.icon }),
        ...(updates.content !== undefined && { content: updates.content }),
        ...(updates.configSchema !== undefined && {
          configSchema: updates.configSchema as Prisma.InputJsonValue,
        }),
      },
    });
    return result.count > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.orgSkill.deleteMany({ where: { id } });
    return result.count > 0;
  }
}

export class WorkspaceSkillDAO {
  static async findAll(workspaceId: string): Promise<WorkspaceSkill[]> {
    return prisma.workspaceSkill.findMany({
      where: { workspaceId },
      orderBy: [{ isRequired: "desc" }, { name: "asc" }],
    });
  }

  static async findById(id: string): Promise<WorkspaceSkill | null> {
    return prisma.workspaceSkill.findUnique({ where: { id } });
  }

  static async findAllWithWorkspaces(): Promise<
    Array<
      WorkspaceSkill & {
        workspaceName: string;
        agentCount: number;
        overrideCount: number;
      }
    >
  > {
    const skills = await prisma.workspaceSkill.findMany({
      include: { workspace: { select: { name: true } }, agentOverrides: true },
      orderBy: [{ name: "asc" }, { workspace: { name: "asc" } }],
    });

    const agentCounts = await prisma.agentWorkspace.groupBy({
      by: ["workspaceId"],
      _count: { agentDid: true },
    });
    const countMap = Object.fromEntries(
      agentCounts.map((r) => [r.workspaceId, r._count.agentDid])
    );

    return skills.map((s) => ({
      ...s,
      workspaceName: (s as any).workspace.name,
      agentCount: countMap[s.workspaceId] ?? 0,
      overrideCount: (s as any).agentOverrides.length,
    }));
  }

  static async create(skill: {
    workspaceId: string;
    name: string;
    description?: string;
    version?: string;
    isRequired?: boolean;
    config?: Record<string, unknown>;
    content?: string;
  }): Promise<WorkspaceSkill> {
    const id = crypto.randomUUID();
    return prisma.workspaceSkill.create({
      data: {
        id,
        workspaceId: skill.workspaceId,
        name: skill.name,
        description: skill.description ?? null,
        version: skill.version ?? null,
        isRequired: skill.isRequired ?? false,
        config: (skill.config as Prisma.InputJsonValue) ?? {},
        content: skill.content ?? null,
      },
    });
  }

  static async update(
    id: string,
    updates: {
      description?: string | null;
      version?: string | null;
      isRequired?: boolean;
      config?: Record<string, unknown>;
      content?: string | null;
    }
  ): Promise<boolean> {
    const data: Prisma.WorkspaceSkillUpdateInput = {};
    if ("description" in updates) data.description = updates.description;
    if ("version" in updates) data.version = updates.version;
    if ("isRequired" in updates) data.isRequired = updates.isRequired;
    if ("config" in updates)
      data.config = updates.config as Prisma.InputJsonValue;
    if ("content" in updates) data.content = updates.content;
    const result = await prisma.workspaceSkill.updateMany({ where: { id }, data });
    return result.count > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.workspaceSkill.deleteMany({ where: { id } });
    return result.count > 0;
  }
}

export class SkillOverrideDAO {
  static async findByAgent(agentDid: string): Promise<AgentSkillOverride[]> {
    return prisma.agentSkillOverride.findMany({ where: { agentDid } });
  }

  static async set(
    agentDid: string,
    workspaceSkillId: string,
    enabled: boolean
  ): Promise<void> {
    await prisma.agentSkillOverride.upsert({
      where: { agentDid_workspaceSkillId: { agentDid, workspaceSkillId } },
      create: { agentDid, workspaceSkillId, enabled },
      update: { enabled },
    });
  }

  static async getEffectiveSkills(agentDid: string): Promise<SkillConfig[]> {
    const rows = await prisma.workspaceSkill.findMany({
      where: {
        workspace: { agentWorkspaces: { some: { agentDid } } },
      },
      include: {
        agentOverrides: {
          where: { agentDid },
        },
      },
      orderBy: [{ isRequired: "desc" }, { name: "asc" }],
    });

    const seen = new Map<string, SkillConfig>();
    for (const row of rows) {
      if (seen.has(row.name)) continue;
      const override = (row as any).agentOverrides[0] ?? null;
      const enabled = row.isRequired ? true : (override?.enabled ?? true);
      seen.set(row.name, {
        name: row.name,
        enabled,
        isRequired: row.isRequired,
        config: (row.config as Record<string, unknown>) ?? {},
        content: row.content ?? undefined,
      });
    }
    return Array.from(seen.values());
  }
}
