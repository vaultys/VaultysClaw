import type { CustomCapability } from "@prisma/client";
import { parseCustomCapability } from "@vaultysclaw/policy";
import { prisma } from "./client";

/**
 * How long a cached name list may be trusted without re-reading.
 *
 * Short on purpose: this is the worst-case window in which a capability deleted by *another*
 * process still resolves here. In-process writes invalidate immediately, so this only covers
 * out-of-band changes.
 */
const CACHE_TTL_MS = 5_000;

let nameCache: { names: string[]; at: number } | null = null;
let inFlight: Promise<string[]> | null = null;

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
    const created = await prisma.customCapability.create({
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
    CustomCapabilityDAO.invalidateCache();
    return created;
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
   * Just the names — the hot path, and cached.
   *
   * Called on **every** `cert_status_request` to filter a certificate's capabilities, so a fleet
   * re-checking its status turns this into one query per check per Actor. A narrow `select` was not
   * enough: at fleet scale it is the query count, not the row width, that hurts.
   *
   * The cache is short-lived rather than permanent, and invalidated explicitly by every write path
   * in this class. The TTL is the backstop for the case the invalidation cannot cover — another
   * process (a second control-plane instance, a migration, someone in psql) changing the table.
   * {@link CACHE_TTL_MS} is therefore the worst-case window in which a deleted capability keeps
   * resolving; it is deliberately small, because that window is a security property, not a
   * performance knob.
   */
  static async listNames(): Promise<string[]> {
    const now = Date.now();
    if (nameCache && now - nameCache.at < CACHE_TTL_MS) return nameCache.names;

    // Collapse concurrent misses into one query. Without this a ramp of N Actors arriving together
    // issues N identical queries before the first one resolves — the exact stampede the cache is
    // meant to prevent.
    if (!inFlight) {
      inFlight = prisma.customCapability
        .findMany({ select: { name: true } })
        .then((rows) => {
          const names = rows.map((r) => r.name);
          nameCache = { names, at: Date.now() };
          return names;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  /**
   * Drop the cached name list.
   *
   * Called by every write path below. A deletion is a mass revoke, so letting it wait out the TTL
   * would mean grants resolving after an admin was told they had been withdrawn.
   */
  static invalidateCache(): void {
    nameCache = null;
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
    // Presentation-only fields, so the *names* are unchanged — but invalidating anyway keeps the
    // rule "every write in this class invalidates" true without exception, which is the only
    // version of that rule anyone can safely reason about later.
    const updated = await prisma.customCapability.update({ where: { id }, data });
    CustomCapabilityDAO.invalidateCache();
    return updated;
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
    CustomCapabilityDAO.invalidateCache();
  }
}
