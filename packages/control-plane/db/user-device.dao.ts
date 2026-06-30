import { prisma } from "./client";
import type { UserDevice, DeviceLinkRequest } from "@prisma/client";

/** Linked VaultysId identities that act in a user's name. */
export class UserDeviceDAO {
  static async create(data: {
    id: string;
    userId: string;
    did: string;
    publicKey?: string | null;
    name?: string | null;
  }): Promise<UserDevice> {
    return prisma.userDevice.upsert({
      where: { did: data.did },
      create: {
        id: data.id,
        userId: data.userId,
        did: data.did,
        publicKey: data.publicKey ?? null,
        name: data.name ?? null,
      },
      update: { userId: data.userId, name: data.name ?? null },
    });
  }

  static async listByUser(userId: string): Promise<UserDevice[]> {
    return prisma.userDevice.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findByDid(did: string): Promise<UserDevice | null> {
    return prisma.userDevice.findUnique({ where: { did } });
  }

  static async findById(id: string): Promise<UserDevice | null> {
    return prisma.userDevice.findUnique({ where: { id } });
  }

  /** Delete a device, scoped to its owner so users can only revoke their own. */
  static async deleteForUser(id: string, userId: string): Promise<boolean> {
    const res = await prisma.userDevice.deleteMany({ where: { id, userId } });
    return res.count > 0;
  }

  static async touch(did: string): Promise<void> {
    await prisma.userDevice.updateMany({
      where: { did },
      data: { lastUsedAt: new Date() },
    });
  }
}

/** Pending requests to link a VaultysId to a user, approved via an invite URL. */
export class DeviceLinkRequestDAO {
  static async create(data: {
    id: string;
    did: string;
    publicKey?: string | null;
    name?: string | null;
    expiresAt: Date;
  }): Promise<DeviceLinkRequest> {
    return prisma.deviceLinkRequest.create({
      data: {
        id: data.id,
        did: data.did,
        publicKey: data.publicKey ?? null,
        name: data.name ?? null,
        expiresAt: data.expiresAt,
      },
    });
  }

  static async findById(id: string): Promise<DeviceLinkRequest | null> {
    return prisma.deviceLinkRequest.findUnique({ where: { id } });
  }

  static async setStatus(
    id: string,
    status: "approved" | "rejected",
    userId?: string
  ): Promise<DeviceLinkRequest> {
    return prisma.deviceLinkRequest.update({
      where: { id },
      data: { status, userId: userId ?? null },
    });
  }
}
