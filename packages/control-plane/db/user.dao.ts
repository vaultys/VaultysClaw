import { prisma } from "./client";
import type { User, UserRealm, UserInvitation, Prisma } from "@prisma/client";
import { normalizeRole, type UserRole } from "@/lib/roles";

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

  static async create(did: string, publicKey: string | null, role: UserRole = "Member"): Promise<User> {
    return prisma.user.create({
      data: { id: did, did, publicKey, role },
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
      data: { id, name: opts.name, email: opts.email, role: normalizeRole(opts.role), reportsTo: opts.reportsTo ?? null },
    });
  }

  static async findByOidcId(sub: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { oidcId: sub } });
  }

  static async createFromOidc(
    sub: string,
    issuer: string,
    name: string | null,
    email: string | null
  ): Promise<User> {
    await prisma.oidcIdentity.upsert({
      where: { sub },
      create: { sub, issuer, name, email },
      update: { name, email, syncedAt: new Date() },
    });
    const id = crypto.randomUUID();
    return prisma.user.create({
      data: { id, name, email, oidcId: sub },
    });
  }

  static async syncOidcProfile(
    userId: string,
    name: string | null,
    email: string | null
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== null ? { name } : {}),
        ...(email !== null ? { email } : {}),
      },
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
    realmId?: string;
    hasAccount?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: "name" | "email" | "registeredAt";
    sortDir?: "asc" | "desc";
  }): Promise<{ users: User[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const { q, role, realmId, hasAccount, page = 1, pageSize = 20, sortBy = "name", sortDir = "asc" } = opts;

    const where: Prisma.UserWhereInput = {};
    if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    if (role) where.role = normalizeRole(role);
    if (realmId) where.userRealms = { some: { realmId } };
    if (hasAccount === true) where.did = { not: null };
    else if (hasAccount === false) where.did = null;

    const orderBy: Prisma.UserOrderByWithRelationInput =
      sortBy === "email" ? { email: sortDir } : sortBy === "registeredAt" ? { registeredAt: sortDir } : { name: sortDir };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async updateLocation(
    id: string,
    location: { lat: number; lon: number; label: string } | null
  ): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        locationLat: location?.lat ?? null,
        locationLon: location?.lon ?? null,
        locationLabel: location?.label ?? null,
      },
    });
  }

  static async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }

  // ─── Invitations ────────────────────────────────────────────────────────────

  /**
   * Upsert an unclaimed user for the given email, delete any prior pending
   * invitations for that address, then create a fresh invitation linked to
   * that user.  Returns both the new token and the unclaimed user id.
   */
  static async createInvitation(
    email: string,
    name: string,
    roleInput: string,
    expiresAt: Date
  ): Promise<{ token: string; userId: string }> {
    const role = normalizeRole(roleInput);
    // Reuse an existing unclaimed user or create one
    let user = await prisma.user.findFirst({ where: { email, did: null } });
    if (!user) {
      user = await UserDAO.createUnclaimed({ name, email, role });
    } else {
      // Keep name/role in sync with whatever the admin typed
      await prisma.user.update({ where: { id: user.id }, data: { name, role } });
    }

    // Delete any previous pending (unclaimed) invitations for this email
    await prisma.userInvitation.deleteMany({
      where: { email, claimedAt: null },
    });

    const token = crypto.randomUUID();
    await prisma.userInvitation.create({
      data: { token, email, name, role, expiresAt, userId: user.id },
    });
    return { token, userId: user.id };
  }

  static async findInvitation(token: string): Promise<UserInvitation | null> {
    return prisma.userInvitation.findUnique({ where: { token } });
  }

  static async claimInvitation(token: string): Promise<void> {
    await prisma.userInvitation.update({ where: { token }, data: { claimedAt: new Date() } });
  }

  static async deleteInvitation(token: string): Promise<void> {
    await prisma.userInvitation.deleteMany({ where: { token } });
  }

  static async cleanExpiredInvitations(): Promise<void> {
    await prisma.userInvitation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  static async hasAnyUser() {
    return (await prisma.user.count()) > 0;
  }

  static async hasOwner() {
    return (await prisma.user.count({ where: { role: "Owner" } })) > 0;
  }

  static async listUnclaimed() {
    return prisma.user.findMany({
      where: { did: null },
    });
  }

  /** Global admins (Owner or Admin) that have claimed an account. */
  static async listAdmins(limit = 20) {
    return prisma.user.findMany({
      where: { role: { in: ["Owner", "Admin"] }, did: { not: null } },
      orderBy: { name: "asc" },
      take: limit,
    });
  }

  static async setRole(did: string, role: UserRole) {
    await prisma.user.updateMany({ where: { did }, data: { role } });
  }

  static async removeByDid(did: string) {
    await prisma.user.deleteMany({ where: { did } });
  }
}
