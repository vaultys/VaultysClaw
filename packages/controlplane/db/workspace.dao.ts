import { prisma } from "./client";
import type { Workspace } from "@prisma/client";

export class WorkspaceDAO {
  static async list(): Promise<Workspace[]> {
    return prisma.workspace.findMany({ orderBy: { createdAt: "asc" } });
  }

  static async findById(id: string): Promise<Workspace | null> {
    return prisma.workspace.findUnique({ where: { id } });
  }

  static async create(data: {
    id: string;
    name: string;
    slug: string;
    description?: string;
  }): Promise<Workspace> {
    return prisma.workspace.create({ data });
  }

  /** Ensures a default workspace exists — called at server bootstrap. */
  static async ensureDefault(): Promise<Workspace> {
    const existing = await prisma.workspace.findFirst({ where: { isDefault: true } });
    if (existing) return existing;
    return prisma.workspace.create({
      data: { id: "default", name: "Default", slug: "default", isDefault: true },
    });
  }
}
