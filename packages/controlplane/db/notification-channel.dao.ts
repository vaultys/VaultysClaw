import { prisma } from "./client";
import type { NotificationChannel } from "@prisma/client";

export class NotificationChannelDAO {
  static async create(data: {
    name: string;
    description?: string | null;
    appriseKey: string;
    serviceUrls: string;
    serviceTypes: string[];
    events: string[];
    createdBy: string;
  }): Promise<NotificationChannel> {
    return prisma.notificationChannel.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        appriseKey: data.appriseKey,
        serviceUrls: data.serviceUrls,
        serviceTypes: data.serviceTypes,
        events: data.events,
        createdBy: data.createdBy,
      },
    });
  }

  static async findById(id: string): Promise<NotificationChannel | null> {
    return prisma.notificationChannel.findUnique({ where: { id } });
  }

  static async list(): Promise<NotificationChannel[]> {
    return prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } });
  }

  static async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      serviceUrls?: string;
      serviceTypes?: string[];
      events?: string[];
      isActive?: boolean;
    }
  ): Promise<NotificationChannel> {
    return prisma.notificationChannel.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    await prisma.notificationChannel.delete({ where: { id } });
  }
}
