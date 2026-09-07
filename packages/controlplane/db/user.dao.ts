import { prisma } from "./client";
import type { Actor, User } from "@prisma/client";

/** Thrown when a human's email address is already held by a different DID. */
export class DuplicateEmailError extends Error {
  constructor(readonly email: string) {
    super(`Email address "${email}" is already registered to another human`);
    this.name = "DuplicateEmailError";
  }
}

/**
 * Whether this error is a unique-constraint violation on a human's email address.
 *
 * `meta.target` is where Prisma's own docs say the offending fields live, and with the `pg` driver
 * adapter it is simply **not there** — the fields arrive at
 * `meta.driverAdapterError.cause.constraint.fields`, with `meta.target` undefined. Verified against
 * the real database rather than assumed, because a check written to the documented shape alone
 * silently never fires, which is worse than not having it: the raw P2002 escapes exactly as before
 * while the code reads as though it were handled.
 *
 * Both shapes are therefore accepted, plus the constraint name from the underlying message as a
 * last resort, so an adapter change degrades to "still detected" instead of "silently off".
 *
 * Exported for its tests rather than because callers need it: a guard whose failure mode is
 * "quietly does nothing" is exactly the kind that has to be asserted against real captured error
 * objects, and it cannot be if it is private.
 */
export function isUniqueEmailViolation(err: unknown): boolean {
  const e = err as {
    code?: string;
    message?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { constraint?: { fields?: unknown }; originalMessage?: string } };
    };
  };
  if (e?.code !== "P2002") return false;

  const mentionsEmail = (value: unknown): boolean => {
    const fields = Array.isArray(value) ? value.map(String) : [String(value ?? "")];
    return fields.some((f) => f.toLowerCase().includes("email"));
  };

  if (mentionsEmail(e.meta?.target)) return true;

  const cause = e.meta?.driverAdapterError?.cause;
  if (mentionsEmail(cause?.constraint?.fields)) return true;
  // e.g. `duplicate key value violates unique constraint "User_email_key"`
  if (cause?.originalMessage?.toLowerCase().includes("email")) return true;

  return false;
}

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

  /**
   * The human holding this email address, if any.
   *
   * `User.email` is `@unique`, so this is the check every path that is about to write an email has
   * to make first — otherwise the collision surfaces as a raw Prisma P2002 from deep inside a
   * nested create, which is what it used to do halfway through an invitation redemption.
   */
  static async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
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
    try {
      return await prisma.actor.create({
        data: {
          did,
          name,
          kind: "human",
          publicKey: publicKey ?? null,
          humanProfile: { create: { email: email ?? null } },
        },
      });
    } catch (err) {
      // `User.email` is unique. Callers are expected to check first (see `findByEmail`), but two
      // redemptions racing on the same address would both pass that check, so translate the
      // constraint violation into something a caller can act on rather than letting a raw P2002
      // escape from inside a nested create — which surfaced as a 500 mid-handshake, with the
      // invitation left unconsumed and the redeemer given no idea why.
      if (isUniqueEmailViolation(err)) {
        throw new DuplicateEmailError(email ?? "");
      }
      throw err;
    }
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
