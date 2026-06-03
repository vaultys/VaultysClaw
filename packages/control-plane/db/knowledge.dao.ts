import { prisma } from "./client";
import type { KnowledgeSource, KnowledgeFile } from "@prisma/client";

export class KnowledgeDAO {
  // ─── Sources ─────────────────────────────────────────────────────────────────

  static async createSource(data: {
    realmId: string;
    agentDid: string;
    name: string;
    sourceType: string;
    config: Record<string, unknown>;
  }): Promise<KnowledgeSource> {
    const id = `ks-${crypto.randomUUID()}`;
    return prisma.knowledgeSource.create({
      data: { id, ...data, status: "idle" },
    });
  }

  static async findSource(id: string): Promise<KnowledgeSource | null> {
    return prisma.knowledgeSource.findUnique({ where: { id } });
  }

  static async listSources(opts?: { realmId?: string; agentDid?: string }): Promise<KnowledgeSource[]> {
    return prisma.knowledgeSource.findMany({
      where: {
        ...(opts?.realmId && { realmId: opts.realmId }),
        ...(opts?.agentDid && { agentDid: opts.agentDid }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateSourceStatus(
    id: string,
    status: string,
    extra?: { docCount?: number; chunkCount?: number; error?: string | null }
  ): Promise<void> {
    await prisma.knowledgeSource.update({
      where: { id },
      data: {
        status,
        ...(extra?.docCount !== undefined && { docCount: extra.docCount }),
        ...(extra?.chunkCount !== undefined && { chunkCount: extra.chunkCount }),
        ...(status === "ready" && { lastSyncedAt: new Date() }),
        ...(extra?.error !== undefined && { error: extra.error }),
      },
    });
  }

  static async deleteSource(id: string): Promise<boolean> {
    const result = await prisma.knowledgeSource.deleteMany({ where: { id } });
    return result.count > 0;
  }

  // ─── Files ───────────────────────────────────────────────────────────────────

  static async createFile(
    sourceId: string,
    name: string,
    mimeType: string,
    size: number,
    filePath: string
  ): Promise<{ id: string; sourceId: string; name: string; mimeType: string; size: number; createdAt: Date }> {
    const id = `kf-${crypto.randomUUID()}`;
    const file = await prisma.knowledgeFile.create({
      data: { id, sourceId, name, mimeType, size, filePath, content: null },
    });
    return {
      id: file.id,
      sourceId: file.sourceId,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
    };
  }

  static async listFiles(sourceId: string): Promise<Array<Omit<KnowledgeFile, "content">>> {
    const files = await prisma.knowledgeFile.findMany({
      where: { sourceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        sourceId: true,
        name: true,
        mimeType: true,
        size: true,
        filePath: true,
        createdAt: true,
      },
    });
    return files as any;
  }

  static async findFile(id: string): Promise<KnowledgeFile | null> {
    return prisma.knowledgeFile.findUnique({ where: { id } });
  }

  static async deleteFile(id: string): Promise<boolean> {
    const result = await prisma.knowledgeFile.deleteMany({ where: { id } });
    return result.count > 0;
  }

  static async getFilePathsForSource(sourceId: string): Promise<Array<{ id: string; filePath: string | null }>> {
    return prisma.knowledgeFile.findMany({
      where: { sourceId },
      select: { id: true, filePath: true },
    });
  }
}
