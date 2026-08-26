import type { CustomCapability } from "@prisma/client";
import { parseCustomCapability } from "@vaultysclaw/policy";
import { prisma } from "./client";

/**
 * The org-global registry of admin-defined `vendor:action` capability names
 * (docs/CUSTOM_CAPABILITIES.md).
 *
 * A row makes a name **grantable** (it appears in the issuance UI and survives
 * the approval filter) and **resolvable** (`lib/ws-server.ts` filters held
 * capabilities against this table before signing a status response). Deleting a
 * row is therefore a mass revoke — see `deleteWithGrantCount` and the note on
 * the model in `schema.prisma`.
 *
 * `name` is validated by `@vaultysclaw/policy` at every write path here, so a
 * malformed name cannot reach the table even via a direct form post.
 */
export class CustomCapabilityDAO {
  /** Create a registry entry. `vendor`/`action` are derived, never taken from the caller. */
  static async create(data: {
    name: string;
    label: string;
    description?: string | null;
    group?: string | null;
    createdBy: string;
  }): Promise<CustomCapability> {
    const { vendor, action } = parseCustomCapability(data.name);
    return prisma.customCapability.create({
      data: {
        name: data.name,
        vendor,
        action,
        label: data.label,
        description: data.description ?? null,
        group: data.group ?? null,
        createdBy: data.createdBy,
      },
    });
  }

  static async findById(id: string): Promise<CustomCapability | null> {
    return prisma.customCapability.findUnique({ where: { id } });
  }

  static async findByName(name: string): Promise<CustomCapability | null> {
    return prisma.customCapability.findUnique({ where: { name } });
  }

  static async list(): Promise<CustomCapability[]> {
    return prisma.customCapability.findMany({ orderBy: [{ vendor: "asc" }, { action: "asc" }] });
  }

  /**
   * Just the names — the hot path.
   *
   * Called on every `cert_status_request` to filter a certificate's capabilities,
   * so it stays a narrow `select` rather than loading whole rows.
   */
  static async listNames(): Promise<string[]> {
    const rows = await prisma.customCapability.findMany({ select: { name: true } });
    return rows.map((r) => r.name);
  }

  /**
   * Update the presentation fields only.
   *
   * `name` is deliberately absent: renaming would silently change which grants
   * resolve, so it is expressed as delete-and-recreate, which correctly reads as
   * a revoke.
   */
  static async update(
    id: string,
    data: { label?: string; description?: string | null; group?: string | null }
  ): Promise<CustomCapability> {
    return prisma.customCapability.update({ where: { id }, data });
  }

  /**
   * How many non-revoked certificates currently carry this capability.
   *
   * The number an admin must see before deleting the row, because deleting it
   * stops every one of those grants resolving. Prisma can't index into a JSON
   * array in a portable way, so this filters in application code over the
   * (small, admin-scale) set of live certificates rather than reaching for raw
   * SQL — `capabilities` is a JSON column, not a Postgres array.
   */
  static async countAffectedGrants(name: string): Promise<number> {
    const certs = await prisma.capabilityCertificate.findMany({
      where: { status: "active" },
      select: { capabilities: true },
    });
    return certs.filter((c) => (c.capabilities as string[]).includes(name)).length;
  }

  /** Every active certificate id carrying this capability, for the revoke-on-delete sweep. */
  static async findAffectedCertIds(name: string): Promise<string[]> {
    const certs = await prisma.capabilityCertificate.findMany({
      where: { status: "active" },
      select: { id: true, capabilities: true },
    });
    return certs.filter((c) => (c.capabilities as string[]).includes(name)).map((c) => c.id);
  }

  static async delete(id: string): Promise<void> {
    await prisma.customCapability.delete({ where: { id } });
  }
}
