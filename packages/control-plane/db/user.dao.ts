import { prisma } from "./client";
import type { User, UserRealm, UserInvitation, Prisma } from "@prisma/client";

export class UserDAO {
  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  static async findByDid(did: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { did } });
  }

  static async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { email } });
  }

  static async findByEntraId(entraId: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { entraId } });
  }

  static async create(did: string, publicKey: string | null, isOwner: boolean): Promise<User> {
    return prisma.user.create({
      data: { id: did, did, publicKey, isOwner },
    });
  }

  static async createUnclaimed(opts: {
    name: string | null;
    email: string | null;
    role?: string;
    reportsTo?: string;
  }): Promise<User> {
    const id = crypto.randomUUID();
    return prisma.user.create({
      data: { id, name: opts.name, email: opts.email, role: opts.role ?? "member", reportsTo: opts.reportsTo ?? null },
    });
  }

  static async createFromEntra(
    entraObjectId: string,
    displayName: string | null,
    email: string | null
  ): Promise<User> {
    await prisma.entraIdentity.upsert({
      where: { id: entraObjectId },
      create: { id: entraObjectId, displayName, mail: email },
      update: { displayName, mail: email, syncedAt: new Date() },
    });
    const id = crypto.randomUUID();
    return prisma.user.create({
      data: { id, name: displayName, email, entraId: entraObjectId },
    });
  }

  static async refreshEntraIdentity(
    entraObjectId: string,
    displayName: string | null,
    email: string | null
  ): Promise<void> {
    await prisma.entraIdentity.upsert({
      where: { id: entraObjectId },
      create: { id: entraObjectId, displayName, mail: email },
      update: { displayName, mail: email, syncedAt: new Date() },
    });
  }

  static async linkEntraIdentity(
    userId: string,
    entraObjectId: string,
    displayName: string | null,
    email: string | null
  ): Promise<void> {
    await prisma.entraIdentity.upsert({
      where: { id: entraObjectId },
      create: { id: entraObjectId, displayName, mail: email },
      update: { displayName, mail: email, syncedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { entraId: entraObjectId, name: displayName, email },
    });
  }

  static async update(
    id: string,
    data: Partial<{
      name: string | null;
      email: string | null;
      role: string;
      isAdmin: boolean;
      isOwner: boolean;
      reportsTo: string | null;
      description: string | null;
    }>
  ): Promise<void> {
    await prisma.user.update({ where: { id }, data });
  }

  static async claim(id: string, did: string, publicKey: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { did, publicKey, claimedAt: new Date() },
    });
  }

  static async list(opts: {
    q?: string;
    role?: string;
    isAdmin?: boolean;
    realmId?: string;
    page?: number;
    pageSize?: number;
    sortBy?: "name" | "email" | "registeredAt";
    sortDir?: "asc" | "desc";
  }): Promise<{ users: User[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const { q, role, isAdmin, realmId, page = 1, pageSize = 20, sortBy = "name", sortDir = "asc" } = opts;

    const where: Prisma.UserWhereInput = {};
    if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    if (role) where.role = role;
    if (isAdmin !== undefined) where.isAdmin = isAdmin;
    if (realmId) where.userRealms = { some: { realmId } };

    const orderBy: Prisma.UserOrderByWithRelationInput =
      sortBy === "email" ? { email: sortDir } : sortBy === "registeredAt" ? { registeredAt: sortDir } : { name: sortDir };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }

  // ─── Invitations ────────────────────────────────────────────────────────────

  static async createInvitation(
    email: string,
    name: string,
    role: string,
    expiresAt: Date
  ): Promise<string> {
    const token = crypto.randomUUID();
    await prisma.userInvitation.create({ data: { token, email, name, role, expiresAt } });
    return token;
  }

  static async findInvitation(token: string): Promise<UserInvitation | null> {
    return prisma.userInvitation.findUnique({ where: { token } });
  }

  static async claimInvitation(token: string): Promise<void> {
    await prisma.userInvitation.update({ where: { token }, data: { claimedAt: new Date() } });
  }

  static async cleanExpiredInvitations(): Promise<void> {
    await prisma.userInvitation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
