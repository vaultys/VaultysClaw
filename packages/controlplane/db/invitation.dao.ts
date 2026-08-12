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
    /** Set only by the SSO binding flow (`lib/sso.ts`) — see the schema comment. */
    ssoIdentityId?: string | null;
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
        ssoIdentityId: input.ssoIdentityId ?? null,
      },
    });
    return { invitation, rawToken };
  }

  /**
   * Drop any still-unredeemed binding invitations for an SSO identity.
   *
   * Called immediately before minting a fresh one, because the raw token is
   * never persisted (only its hash), so a previously issued link can't be
   * *reused* — it can only be left lying around. Clearing them keeps exactly one
   * live binding link per identity: a user who abandons the flow and signs in
   * again doesn't accumulate a pile of independently-valid links, and any link
   * already sitting in a browser history or a proxy log stops working the moment
   * a newer one is issued.
   */
  static async deletePendingForSsoIdentity(ssoIdentityId: string): Promise<number> {
    const result = await prisma.invitation.deleteMany({
      where: { ssoIdentityId, redeemedAt: null },
    });
    return result.count;
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
