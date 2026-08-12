import { prisma } from "./client";
import type { SsoConnection, SsoIdentity } from "@prisma/client";

/**
 * SSO connection + external-identity persistence. Neither DAO ever returns a
 * decrypted secret — `clientSecretEnc` is passed through as ciphertext and only
 * `lib/sso-config.ts` opens it, keeping the decrypt capability in one place.
 */
export class SsoConnectionDAO {
  static async create(data: {
    kind: string;
    name: string;
    issuer: string;
    clientId: string;
    clientSecretEnc: string;
    tenantId?: string | null;
    createdBy: string;
  }): Promise<SsoConnection> {
    return prisma.ssoConnection.create({
      data: { ...data, tenantId: data.tenantId ?? null },
    });
  }

  static async list(): Promise<SsoConnection[]> {
    return prisma.ssoConnection.findMany({ orderBy: { createdAt: "asc" } });
  }

  /** What the login page and `buildAuthOptions()` actually render/wire up. */
  static async listActive(): Promise<SsoConnection[]> {
    return prisma.ssoConnection.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }

  static async findById(id: string): Promise<SsoConnection | null> {
    return prisma.ssoConnection.findUnique({ where: { id } });
  }

  static async update(
    id: string,
    data: {
      name?: string;
      issuer?: string;
      clientId?: string;
      clientSecretEnc?: string;
      tenantId?: string | null;
      isActive?: boolean;
    }
  ): Promise<SsoConnection> {
    return prisma.ssoConnection.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    await prisma.ssoConnection.delete({ where: { id } });
  }

  /** How many humans currently reach the console through this connection — the
   *  number an admin needs before deleting one. */
  static async boundIdentityCount(id: string): Promise<number> {
    return prisma.ssoIdentity.count({ where: { connectionId: id, did: { not: null } } });
  }
}

export class SsoIdentityDAO {
  static async findBySubject(connectionId: string, subject: string): Promise<SsoIdentity | null> {
    return prisma.ssoIdentity.findUnique({
      where: { connectionId_subject: { connectionId, subject } },
    });
  }

  /**
   * Record this login and return the row. Profile claims are refreshed every time
   * (a user's name/email at the IdP is authoritative and can change); `did` is
   * never touched here — binding is a separate, deliberate step.
   */
  static async upsertFromClaims(data: {
    connectionId: string;
    subject: string;
    issuer: string;
    email?: string | null;
    name?: string | null;
  }): Promise<SsoIdentity> {
    return prisma.ssoIdentity.upsert({
      where: { connectionId_subject: { connectionId: data.connectionId, subject: data.subject } },
      create: {
        connectionId: data.connectionId,
        subject: data.subject,
        issuer: data.issuer,
        email: data.email ?? null,
        name: data.name ?? null,
        lastLoginAt: new Date(),
      },
      update: {
        email: data.email ?? null,
        name: data.name ?? null,
        issuer: data.issuer,
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * Bind an external identity to a DID. Returns false if the row is already
   * bound — a completed binding is never silently repointed at a different DID,
   * which is what would let a replayed binding link take over someone's account.
   */
  static async bindDid(id: string, did: string): Promise<boolean> {
    const result = await prisma.ssoIdentity.updateMany({
      where: { id, did: null },
      data: { did },
    });
    return result.count === 1;
  }

  static async listForConnection(connectionId: string): Promise<SsoIdentity[]> {
    return prisma.ssoIdentity.findMany({
      where: { connectionId },
      orderBy: { lastLoginAt: "desc" },
    });
  }

  static async findByDid(did: string): Promise<SsoIdentity | null> {
    return prisma.ssoIdentity.findUnique({ where: { did } });
  }
}
