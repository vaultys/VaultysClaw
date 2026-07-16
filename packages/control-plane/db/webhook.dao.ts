import { prisma } from "./client";
import type { Webhook } from "@prisma/client";

export class WebhookDAO {
  static async create(data: {
    id?: string;
    name: string;
    description?: string | null;
    url: string;
    secret: string;
    events?: string[];
    isActive?: boolean;
    createdBy: string;
  }): Promise<Webhook> {
    return prisma.webhook.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        description: data.description ?? null,
        url: data.url,
        secret: data.secret,
        events: data.events ?? [],
        isActive: data.isActive ?? true,
        createdBy: data.createdBy,
      },
    });
  }

  static async findById(id: string): Promise<Webhook | null> {
    return prisma.webhook.findUnique({ where: { id } });
  }

  static async findAll(): Promise<Webhook[]> {
    return prisma.webhook.findMany({ orderBy: { createdAt: "desc" } });
  }

  static async findActive(): Promise<Webhook[]> {
    return prisma.webhook.findMany({ where: { isActive: true } });
  }

  static async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      url?: string;
      events?: string[];
      isActive?: boolean;
    }
  ): Promise<Webhook> {
    return prisma.webhook.update({ where: { id }, data });
  }

  static async regenerateSecret(id: string, secret: string): Promise<Webhook> {
    return prisma.webhook.update({ where: { id }, data: { secret } });
  }

  static async delete(id: string): Promise<boolean> {
    const result = await prisma.webhook.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
