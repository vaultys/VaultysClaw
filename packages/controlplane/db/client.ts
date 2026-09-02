import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Connection-pool size.
 *
 * `pg.Pool` defaults to **10**, which is the wrong number for this process: the WebSocket server
 * and the Next.js request handlers share one pool, and a fleet ramp puts several queries behind
 * every handshake. At ten connections the queue in front of the pool, not the database, becomes the
 * limit — handshake p99 measured in tens of seconds while Postgres itself was idle.
 *
 * Sized against the database's own `max_connections` (Postgres defaults to 100, shared with every
 * other client — the webhook dispatcher and any psql session included), so this deliberately does
 * not claim all of it.
 */
const DEFAULT_POOL_MAX = 40;

function poolMax(): number {
  const raw = process.env.DATABASE_POOL_MAX;
  if (!raw) return DEFAULT_POOL_MAX;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`DATABASE_POOL_MAX must be a positive integer, got "${raw}"`);
  }
  return n;
}

function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolMax(),
    // Let idle connections go rather than pinning the pool's high-water mark forever: a ramp is
    // bursty, and holding 40 sockets open all night to serve an idle console is antisocial towards
    // whatever else shares this Postgres.
    idleTimeoutMillis: 30_000,
    // Fail a query that cannot get a connection instead of hanging indefinitely. Without this a
    // saturated pool surfaces as a request that never returns, which is much harder to diagnose
    // than an error that names the pool.
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as never);
}

// Lazy singleton: DATABASE_URL is read at first use, not at import time.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return (globalForPrisma.prisma as never)[prop as string];
  },
});
