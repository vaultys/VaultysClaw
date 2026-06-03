import { prisma } from "./client";
import type {
  Channel,
  ChannelMember,
  ChannelMessage,
  ChannelBridge,
  Prisma,
} from "@prisma/client";

export class ChannelDAO {
  static async create(data: {
    id?: string;
    realmId?: string;
    name: string;
    slug: string;
    description?: string;
    isPublic?: boolean;
    isArchived?: boolean;
    topic?: string;
    creatorDid: string;
  }): Promise<Channel> {
    const id = data.id ?? crypto.randomUUID();
    return prisma.channel.create({
      data: {
        id,
        realmId: data.realmId ?? null,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        isPublic: data.isPublic ?? true,
        isArchived: data.isArchived ?? false,
        topic: data.topic ?? null,
        creatorDid: data.creatorDid,
      },
    });
  }

  static async findById(id: string): Promise<Channel | null> {
    return prisma.channel.findUnique({ where: { id } });
  }

  static async findBySlug(
    slug: string,
    realmId?: string
  ): Promise<Channel | null> {
    if (realmId) {
      return prisma.channel.findUnique({
        where: { realmId_slug: { realmId, slug } },
      });
    }
    return prisma.channel.findFirst({ where: { slug, realmId: null } });
  }

  static async listByRealm(realmId: string): Promise<Channel[]> {
    return prisma.channel.findMany({
      where: { realmId, isArchived: false },
      orderBy: { createdAt: "desc" },
    });
  }

  static async listGlobal(): Promise<Channel[]> {
    return prisma.channel.findMany({
      where: { realmId: null, isArchived: false },
      orderBy: { createdAt: "desc" },
    });
  }

  static async listByRealmWithGlobal(realmId: string): Promise<Channel[]> {
    return prisma.channel.findMany({
      where: { OR: [{ realmId }, { realmId: null }], isArchived: false },
      orderBy: { createdAt: "desc" },
    });
  }

  static async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      isPublic: boolean;
      isArchived: boolean;
      topic: string | null;
    }>
  ): Promise<boolean> {
    const result = await prisma.channel.updateMany({ where: { id }, data });
    return result.count > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.channel.deleteMany({ where: { id } });
    return result.count > 0;
  }
}

export class ChannelMemberDAO {
  static async add(data: {
    channelId: string;
    memberDid: string;
    memberType: "user" | "agent";
    role?: string;
    invitedBy?: string;
  }): Promise<ChannelMember> {
    const id = crypto.randomUUID();
    return prisma.channelMember.create({
      data: {
        id,
        channelId: data.channelId,
        memberDid: data.memberDid,
        memberType: data.memberType,
        role: data.role ?? "member",
        invitedBy: data.invitedBy ?? null,
      },
    });
  }

  static async listByChannel(channelId: string): Promise<ChannelMember[]> {
    return prisma.channelMember.findMany({ where: { channelId } });
  }

  static async listByMember(memberDid: string): Promise<ChannelMember[]> {
    return prisma.channelMember.findMany({ where: { memberDid } });
  }

  static async findMembership(
    channelId: string,
    memberDid: string
  ): Promise<ChannelMember | null> {
    return prisma.channelMember.findUnique({
      where: { channelId_memberDid: { channelId, memberDid } },
    });
  }

  static async remove(channelId: string, memberDid: string): Promise<boolean> {
    const result = await prisma.channelMember.deleteMany({
      where: { channelId, memberDid },
    });
    return result.count > 0;
  }
}

export class ChannelMessageDAO {
  static async create(data: {
    channelId: string;
    authorDid: string;
    authorType: "user" | "agent";
    content: string;
    threadId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChannelMessage> {
    const id = crypto.randomUUID();
    return prisma.channelMessage.create({
      data: {
        id,
        channelId: data.channelId,
        authorDid: data.authorDid,
        authorType: data.authorType,
        content: data.content,
        threadId: data.threadId ?? null,
        metadata: (data.metadata as Prisma.InputJsonValue) ?? {},
      },
    });
  }

  static async findById(id: string): Promise<ChannelMessage | null> {
    return prisma.channelMessage.findUnique({ where: { id } });
  }

  static async listByChannel(
    channelId: string,
    limit = 50,
    before?: string
  ): Promise<ChannelMessage[]> {
    return prisma.channelMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async listThread(threadId: string): Promise<ChannelMessage[]> {
    return prisma.channelMessage.findMany({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  static async update(id: string, content: string): Promise<boolean> {
    const result = await prisma.channelMessage.updateMany({
      where: { id },
      data: { content, editedAt: new Date() },
    });
    return result.count > 0;
  }

  static async softDelete(id: string): Promise<boolean> {
    const result = await prisma.channelMessage.updateMany({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }

  static async addReaction(
    id: string,
    emoji: string,
    userDid: string
  ): Promise<void> {
    const msg = await prisma.channelMessage.findUnique({
      where: { id },
      select: { reactions: true },
    });
    if (!msg) return;
    const reactions = (msg.reactions as Record<string, string[]>) ?? {};
    if (!reactions[emoji]) reactions[emoji] = [];
    if (!reactions[emoji].includes(userDid)) reactions[emoji].push(userDid);
    await prisma.channelMessage.update({ where: { id }, data: { reactions } });
  }
}

export class ChannelBridgeDAO {
  static async create(data: {
    channelId: string;
    externalService: string;
    externalChannelId: string;
    externalChannelName: string;
    externalWorkspaceId: string;
    syncDirection?: string;
    configJson: Record<string, unknown>;
  }): Promise<ChannelBridge> {
    const id = crypto.randomUUID();
    return prisma.channelBridge.create({
      data: {
        id,
        channelId: data.channelId,
        externalService: data.externalService,
        externalChannelId: data.externalChannelId,
        externalChannelName: data.externalChannelName,
        externalWorkspaceId: data.externalWorkspaceId,
        syncDirection: data.syncDirection ?? "bidirectional",
        configJson: data.configJson as Prisma.InputJsonValue,
      },
    });
  }

  static async listByChannel(channelId: string): Promise<ChannelBridge[]> {
    return prisma.channelBridge.findMany({ where: { channelId } });
  }

  static async findById(id: string): Promise<ChannelBridge | null> {
    return prisma.channelBridge.findUnique({ where: { id } });
  }

  static async update(
    id: string,
    data: Partial<{
      externalChannelName: string;
      syncDirection: string;
      isSyncEnabled: boolean;
      configJson: Record<string, unknown>;
    }>
  ): Promise<boolean> {
    const result = await prisma.channelBridge.updateMany({
      where: { id },
      data: {
        externalChannelName: data.externalChannelName,
        syncDirection: data.syncDirection,
        isSyncEnabled: data.isSyncEnabled,
        configJson: data.configJson as Prisma.InputJsonValue,
      },
    });
    return result.count > 0;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.channelBridge.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
