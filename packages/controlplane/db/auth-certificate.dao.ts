import { prisma } from "./client";
import type { AuthCertificate } from "@prisma/client";

/** DAO for the raw VaultysId handshake artifact — see schema.prisma's AuthCertificate comment. */
export class AuthCertificateDAO {
  static async create(data: {
    id: string;
    key: string;
    registration?: string;
    connection?: string;
    register?: number;
    data?: string;
    metadata?: string;
  }): Promise<AuthCertificate> {
    return prisma.authCertificate.create({ data });
  }

  static async findByRegistration(registration: string): Promise<AuthCertificate | null> {
    return prisma.authCertificate.findUnique({ where: { registration } });
  }

  static async findByConnection(connection: string): Promise<AuthCertificate | null> {
    return prisma.authCertificate.findUnique({ where: { connection } });
  }

  static async findByKey(key: string): Promise<AuthCertificate | null> {
    return prisma.authCertificate.findFirst({ where: { key } });
  }

  static async update(
    id: string,
    data: { data?: string; status?: number; metadata?: string }
  ): Promise<void> {
    await prisma.authCertificate.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    await prisma.authCertificate.deleteMany({ where: { id } });
  }

  /** Drop every row started before `cutoff`, returning how many went. Expiry is enforced on read
   *  (`lib/user-login-channel.ts`), so this reclaims storage rather than withdrawing access —
   *  which is why it is safe to run opportunistically and from more than one instance at once. */
  static async deleteStartedBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.authCertificate.deleteMany({
      where: { startedAt: { lt: cutoff } },
    });
    return count;
  }
}
