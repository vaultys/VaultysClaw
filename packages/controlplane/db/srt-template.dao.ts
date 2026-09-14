import type { SrtTemplate } from "@prisma/client";
import { prisma } from "./client";

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

  /** Every workspace's assigned default, keyed by workspace id. */
  static async assignments(): Promise<Map<string, string>> {
    const rows = await prisma.srtTemplateWorkspace.findMany();
    return new Map(rows.map((r) => [r.workspaceId, r.templateId]));
  }

  /** The template to pre-fill for an actor in this workspace, if any. */
  static async forWorkspace(workspaceId: string | null): Promise<SrtTemplate | null> {
    if (!workspaceId) return null;
    const row = await prisma.srtTemplateWorkspace.findUnique({
      where: { workspaceId },
      include: { template: true },
    });
    return row?.template ?? null;
  }

  /**
   * Assign a template as a workspace's default, replacing any existing one.
   *
   * An upsert rather than an insert because the model allows one default per
   * workspace: assigning a second must replace the first, not leave two
   * candidates and no rule for choosing between them.
   */
  static async assign(workspaceId: string, templateId: string): Promise<void> {
    await prisma.srtTemplateWorkspace.upsert({
      where: { workspaceId },
      create: { workspaceId, templateId },
      update: { templateId, assignedAt: new Date() },
    });
  }

  static async unassign(workspaceId: string): Promise<void> {
    await prisma.srtTemplateWorkspace.deleteMany({ where: { workspaceId } });
  }
}
