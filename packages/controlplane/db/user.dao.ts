import { prisma } from "./client";
import type { Actor, User } from "@prisma/client";

/**
 * A human's profile + Actor row together — a human is a `kind: "human"`
 * Actor (docs/REBUILD_ARCHITECTURE.md §4.5), not a separate identity
 * table. This DAO handles the human-specific onboarding path (self-onboard on
 * first VaultysId login, no admin approval to *exist* — access is gated
 * separately by whatever certificates they hold).
 */
export class UserDAO {
  static async findByDid(did: string): Promise<(Actor & { humanProfile: User | null }) | null> {
    return prisma.actor.findUnique({
      where: { did },
      include: { humanProfile: true },
    });
  }

  /** Creates the Actor + User rows for a human's first login, if they don't exist yet. */
  static async ensureExists(
    did: string,
    name: string,
    email?: string | null,
    publicKey?: string | null
  ): Promise<Actor> {
    const existing = await prisma.actor.findUnique({ where: { did } });
    if (existing) {
      return prisma.actor.update({ where: { did }, data: { lastSeen: new Date() } });
    }
    return prisma.actor.create({
      data: {
        did,
        name,
        kind: "human",
        publicKey: publicKey ?? null,
        humanProfile: { create: { email: email ?? null } },
      },
    });
  }

  /** Admin editing a human's profile from the Actor detail page — email is unique, so a
   *  collision with another human's address surfaces as a normal thrown error (Prisma P2002). */
  static async updateEmail(did: string, email: string | null): Promise<void> {
    await prisma.user.update({ where: { did }, data: { email } });
  }

  /** Marks the one-time first-login profile-completion prompt (app/welcome) as done — called
   *  whether the human actually filled in the form or explicitly skipped it, and immediately at
   *  creation time for an invite-based registration (which already has a real name/email). */
  static async markProfileCompleted(did: string): Promise<void> {
    await prisma.user.update({ where: { did }, data: { profileCompletedAt: new Date() } });
  }
}
