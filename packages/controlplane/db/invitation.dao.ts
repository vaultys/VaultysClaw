import crypto from "crypto";
import { prisma } from "./client";
import type { Invitation } from "@prisma/client";
import type { AgentCapability } from "@vaultysclaw/policy";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Admin-issued, single-use invite for a human to onboard directly — see the schema comment on
 * `Invitation` and `packages/controlplane/CLAUDE.md`'s "Human onboarding via invite". The raw
 * token is generated and returned exactly once here, at creation; every other method only ever
 * sees/stores its hash.
 */
export class InvitationDAO {
  static async create(input: {
    name: string;
    email?: string | null;
    capabilities: AgentCapability[];
    workspaceId?: string | null;
    createdBy: string;
    expiresAt: Date;
  }): Promise<{ invitation: Invitation; rawToken: string }> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const invitation = await prisma.invitation.create({
      data: {
        tokenHash: hashToken(rawToken),
        name: input.name,
        email: input.email ?? null,
        capabilities: input.capabilities as never,
        workspaceId: input.workspaceId ?? null,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
      },
    });
    return { invitation, rawToken };
  }

  /** Only returns a row that's genuinely still redeemable — not found, expired, or already
   *  redeemed all return `null` alike, so a caller can't distinguish "no such invite" from
   *  "used up" by timing/response shape (matches this package's other public-route conventions). */
  static async findValidByToken(rawToken: string): Promise<Invitation | null> {
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!invitation) return null;
    if (invitation.redeemedAt) return null;
    if (invitation.expiresAt.getTime() <= Date.now()) return null;
    return invitation;
  }

  /** Distinguishes not-found from expired from already-redeemed, for the redemption page's
   *  pre-flight check (`GET /api/public/invite/[token]`) — unlike `findValidByToken`, this is
   *  allowed to be more specific since it's answering "why can't I use this," not deciding
   *  whether to actually register someone. */
  static async findByToken(rawToken: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  }

  static async markRedeemed(tokenHash: string, did: string): Promise<void> {
    await prisma.invitation.update({
      where: { tokenHash },
      data: { redeemedAt: new Date(), redeemedDid: did },
    });
  }
}
