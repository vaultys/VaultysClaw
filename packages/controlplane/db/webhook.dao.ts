import { prisma } from "./client";
import type { Webhook } from "@prisma/client";

export class WebhookDAO {
  static async create(data: {
    name: string;
    description?: string | null;
    url: string;
    secret: string;
    events: string[];
    createdBy: string;
  }): Promise<Webhook> {
    return prisma.webhook.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        url: data.url,
        secret: data.secret,
        events: data.events,
        createdBy: data.createdBy,
      },
    });
  }

  static async findById(id: string): Promise<Webhook | null> {
    return prisma.webhook.findUnique({ where: { id } });
  }

  static async list(): Promise<Webhook[]> {
    return prisma.webhook.findMany({ orderBy: { createdAt: "desc" } });
  }

  /** The set the dispatcher actually delivers to — `packages/webhook-dispatcher`'s
   *  `loadActiveWebhooks` dependency, same shape, against this schema instead. */
  static async findActive(): Promise<Webhook[]> {
    return prisma.webhook.findMany({ where: { isActive: true } });
  }

  static async update(
    id: string,
    data: { name?: string; description?: string | null; url?: string; events?: string[]; isActive?: boolean }
  ): Promise<Webhook> {
    return prisma.webhook.update({ where: { id }, data });
  }

  static async regenerateSecret(id: string, secret: string): Promise<Webhook> {
    return prisma.webhook.update({ where: { id }, data: { secret } });
  }

  static async delete(id: string): Promise<void> {
    await prisma.webhook.delete({ where: { id } });
  }
}
