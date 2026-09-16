import { prisma } from "./client";
import type { Workspace, CapabilityCertificate } from "@prisma/client";

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
    color?: string;
  }): Promise<Workspace> {
    return prisma.workspace.create({ data });
  }

  /**
   * `undefined` leaves a field alone; `null` clears it. The distinction carries
   * real meaning for the two trust columns, where null is not "empty" but
   * "inherit the org-wide setting" (`lib/trust-policy.ts`).
   */
  static async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      color?: string;
      certFailMode?: string | null;
      certStapleTtlSeconds?: number | null;
    }
  ): Promise<Workspace> {
    return prisma.workspace.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.certFailMode !== undefined ? { certFailMode: data.certFailMode } : {}),
        ...(data.certStapleTtlSeconds !== undefined
          ? { certStapleTtlSeconds: data.certStapleTtlSeconds }
          : {}),
      },
    });
  }

  /**
   * Every workspace that overrides at least one trust-policy field, and only
   * those fields (docs/CERTIFICATE_WEB_OF_TRUST.md §5.3).
   *
   * One query for the whole fleet's overrides, because `lib/trust-policy.ts`
   * caches the resolved state rather than looking up one workspace at a time —
   * `buildActorConfig` runs on the connection path, and a per-Actor query there
   * is the scaling regression this package's CLAUDE.md "Scale" section is about.
   * A workspace missing from the result is indistinguishable from one whose two
   * columns are both null, which is what "inherit everything" means.
   */
  static async listTrustOverrides(): Promise<
    { id: string; certFailMode: string | null; certStapleTtlSeconds: number | null }[]
  > {
    return prisma.workspace.findMany({
      where: {
        OR: [{ certFailMode: { not: null } }, { certStapleTtlSeconds: { not: null } }],
      },
      select: { id: true, certFailMode: true, certStapleTtlSeconds: true },
    });
  }

  static async countActors(id: string): Promise<number> {
    return prisma.actor.count({ where: { workspaceId: id } });
  }

  /**
   * Every active certificate that only makes sense while this workspace exists —
   * both the ones stamped with `workspaceId` and the ones a `CertScope` pins to
   * `workspace:<id>`. The two are not the same set: the workspaces detail page's
   * Access tab is built entirely from the scope form, which has no foreign key and
   * so would survive the delete as a grant scoped to a resource nobody can look up.
   */
  static async listActiveScopedCertificates(id: string): Promise<CapabilityCertificate[]> {
    return prisma.capabilityCertificate.findMany({
      where: {
        status: "active",
        OR: [
          { workspaceId: id },
          { scope: { path: ["resource"], equals: `workspace:${id}` } },
        ],
      },
    });
  }

  /**
   * Deletes a workspace and severs everything still pointing at it.
   *
   * The relations look after themselves: `Actor.workspaceId` and
   * `CapabilityCertificate.workspaceId` are `onDelete: SetNull`, and
   * `ModelWorkspaceAccess` rows cascade away. `PendingRegistration.targetWorkspaceId`
   * and `Invitation.workspaceId` are plain strings with no relation, so nothing
   * clears those for us — left behind, approving that registration or redeeming
   * that invite would try to place an Actor into a workspace id that no longer
   * exists and fail on the Actor's own foreign key, long after the delete.
   */
  static async delete(id: string): Promise<void> {
    await prisma.$transaction([
      prisma.pendingRegistration.updateMany({
        where: { targetWorkspaceId: id },
        data: { targetWorkspaceId: null },
      }),
      prisma.invitation.updateMany({ where: { workspaceId: id }, data: { workspaceId: null } }),
      prisma.workspace.delete({ where: { id } }),
    ]);
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
