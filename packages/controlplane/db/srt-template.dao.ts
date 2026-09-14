import type { SrtTemplate } from "@prisma/client";
import { prisma } from "./client";

/** One template attached to a workspace, with the template itself resolved. */
export interface AttachedTemplate {
  template: SrtTemplate;
  isDefault: boolean;
  assignedAt: Date;
}

/** The same attachment, without the join — for the all-workspaces overviews. */
export interface WorkspaceAttachment {
  templateId: string;
  isDefault: boolean;
}

/**
 * Reusable tier-B confinement settings, in sandbox-runtime's own schema.
 *
 * A template grants nothing and enforces nothing — see the model note in
 * `schema.prisma`. It is read at issuance to pre-fill the form; the signed
 * certificate records what the admin actually submitted, which may differ.
 *
 * `settings` is stored and returned opaquely. srt owns that schema and validates
 * it at launch; a Prisma-level mirror would be a fourth copy of a third-party
 * research preview's shape, stale in the one direction that matters.
 */
export class SrtTemplateDAO {
  static async list(): Promise<SrtTemplate[]> {
    return prisma.srtTemplate.findMany({ orderBy: { name: "asc" } });
  }

  static async findById(id: string): Promise<SrtTemplate | null> {
    return prisma.srtTemplate.findUnique({ where: { id } });
  }

  static async create(data: {
    name: string;
    description?: string | null;
    settings: Record<string, unknown>;
    allowedDomains: string[];
    createdBy?: string | null;
  }): Promise<SrtTemplate> {
    return prisma.srtTemplate.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        settings: data.settings as never,
        allowedDomains: data.allowedDomains,
        createdBy: data.createdBy ?? null,
      },
    });
  }

  static async update(
    id: string,
    data: {
      name: string;
      description?: string | null;
      settings: Record<string, unknown>;
      allowedDomains: string[];
    }
  ): Promise<SrtTemplate> {
    return prisma.srtTemplate.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
        settings: data.settings as never,
        allowedDomains: data.allowedDomains,
      },
    });
  }

  /**
   * Delete a template.
   *
   * Unlike deleting a custom capability, this revokes nothing: certificates
   * already issued from it carry their own signed copy of the settings and are
   * entirely unaffected. Only future pre-filling is lost.
   */
  static async delete(id: string): Promise<void> {
    await prisma.srtTemplate.delete({ where: { id } });
  }

  /** Every workspace's default template, keyed by workspace id. */
  static async assignments(): Promise<Map<string, string>> {
    const rows = await prisma.srtTemplateWorkspace.findMany({ where: { isDefault: true } });
    return new Map(rows.map((r) => [r.workspaceId, r.templateId]));
  }

  /** Every workspace's attached templates, keyed by workspace id. */
  static async workspaceAttachments(): Promise<Map<string, WorkspaceAttachment[]>> {
    const rows = await prisma.srtTemplateWorkspace.findMany();
    const byWorkspace = new Map<string, WorkspaceAttachment[]>();
    for (const row of rows) {
      const list = byWorkspace.get(row.workspaceId) ?? [];
      list.push({ templateId: row.templateId, isDefault: row.isDefault });
      byWorkspace.set(row.workspaceId, list);
    }
    return byWorkspace;
  }

  /** The templates attached to one workspace, the default first, then by name. */
  static async listForWorkspace(workspaceId: string): Promise<AttachedTemplate[]> {
    const rows = await prisma.srtTemplateWorkspace.findMany({
      where: { workspaceId },
      include: { template: true },
      orderBy: [{ isDefault: "desc" }, { template: { name: "asc" } }],
    });
    return rows.map((row) => ({
      template: row.template,
      isDefault: row.isDefault,
      assignedAt: row.assignedAt,
    }));
  }

  /** The template to pre-fill for an actor in this workspace, if any. */
  static async forWorkspace(workspaceId: string | null): Promise<SrtTemplate | null> {
    if (!workspaceId) return null;
    const row = await prisma.srtTemplateWorkspace.findFirst({
      where: { workspaceId, isDefault: true },
      include: { template: true },
    });
    return row?.template ?? null;
  }

  /**
   * Attach a template to a workspace, leaving the workspace's default alone.
   *
   * Idempotent — re-attaching an already-attached template is a no-op rather
   * than an error, because both admin surfaces can submit the same pair and
   * neither is the authority on what the other is currently showing.
   */
  static async attach(workspaceId: string, templateId: string): Promise<void> {
    await prisma.srtTemplateWorkspace.createMany({
      data: [{ workspaceId, templateId }],
      skipDuplicates: true,
    });
  }

  /**
   * Detach a template from a workspace.
   *
   * Detaching the default simply leaves the workspace with no default; nothing
   * is promoted in its place, because there is no rule for choosing which of
   * the remaining templates an admin meant.
   */
  static async detach(workspaceId: string, templateId: string): Promise<void> {
    await prisma.srtTemplateWorkspace.deleteMany({ where: { workspaceId, templateId } });
  }

  /**
   * Set — or clear, with `null` — a workspace's default template.
   *
   * One transaction, clearing first, so the partial unique index backing the
   * "at most one default" invariant is never transiently violated. Marking a
   * template default also **attaches** it (the upsert), so there is no state in
   * which a workspace's default is not one of its templates.
   */
  static async setDefault(workspaceId: string, templateId: string | null): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.srtTemplateWorkspace.updateMany({
        where: { workspaceId, isDefault: true },
        data: { isDefault: false },
      });
      if (templateId === null) return;
      await tx.srtTemplateWorkspace.upsert({
        where: { workspaceId_templateId: { workspaceId, templateId } },
        create: { workspaceId, templateId, isDefault: true },
        update: { isDefault: true },
      });
    });
  }
}
