import { prisma } from "./client";

export class SettingsDAO {
  static async get(key: string): Promise<string | undefined> {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row?.value ?? undefined;
  }

  static async set(key: string, value: string): Promise<void> {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  static async getMany(keys: string[]): Promise<Record<string, string>> {
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  static async delete(key: string): Promise<void> {
    await prisma.setting.deleteMany({ where: { key } });
  }
}
