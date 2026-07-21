import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

/**
 * Prisma client for the webhook dispatcher. Reuses the same generated client and
 * schema as the control plane (generated into the workspace root
 * `@prisma/client`), and the same pg adapter wiring as `control-plane/db/client.ts`.
 */
function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

export const prisma: PrismaClient = createPrismaClient();
