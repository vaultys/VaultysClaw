import { prisma } from "./client";
import type { Principal, User } from "@prisma/client";

/**
 * A human's profile + Principal row together — a human is a `kind: "human"`
 * Principal (docs/REBUILD_ARCHITECTURE.md §4.5), not a separate identity
 * table. This DAO handles the human-specific onboarding path (self-onboard on
 * first VaultysId login, no admin approval to *exist* — access is gated
 * separately by whatever certificates they hold).
 */
export class UserDAO {
  static async findByDid(did: string): Promise<(Principal & { humanProfile: User | null }) | null> {
    return prisma.principal.findUnique({
      where: { did },
      include: { humanProfile: true },
    });
  }

  /** Creates the Principal + User rows for a human's first login, if they don't exist yet. */
  static async ensureExists(did: string, name: string, email?: string | null): Promise<Principal> {
    const existing = await prisma.principal.findUnique({ where: { did } });
    if (existing) {
      return prisma.principal.update({ where: { did }, data: { lastSeen: new Date() } });
    }
    return prisma.principal.create({
      data: {
        did,
        name,
        kind: "human",
        humanProfile: { create: { email: email ?? null } },
      },
    });
  }
}
