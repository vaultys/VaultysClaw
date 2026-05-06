/**
 * Node.js/Vitest shim for bun:sqlite.
 * Wraps better-sqlite3 to expose the bun:sqlite API surface used by db.ts.
 *
 * Key difference: bun:sqlite named-param objects use { $key: value }
 * but better-sqlite3 expects { key: value } (no prefix).
 * This shim strips the $/:/@  prefix from object keys before forwarding.
 *
 * This file is aliased as "bun:sqlite" in vitest.config.mjs so tests run
 * under Node.js without requiring Bun.
 */

import BetterSqlite3 from "better-sqlite3";

/** Strip $, :, @ prefix from each key so better-sqlite3 accepts bun-style named params. */
function normalizeParams(
  params: Record<string, unknown> | unknown[] | null | undefined
): Record<string, unknown> | unknown[] | undefined {
  if (!params) return undefined;
  if (Array.isArray(params)) return params;
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k.startsWith("$") || k.startsWith(":") || k.startsWith("@") ? k.slice(1) : k,
      v,
    ])
  );
}

export class Database {
  private _db: BetterSqlite3.Database;

  constructor(pathOrMemory: string) {
    this._db = new BetterSqlite3(pathOrMemory);
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  query<T = unknown>(sql: string) {
    const stmt = this._db.prepare(sql);
    return {
      run: (params?: Record<string, unknown> | unknown[]) => {
        const p = normalizeParams(params);
        return p !== undefined ? stmt.run(p as any) : stmt.run();
      },
      get: (params?: Record<string, unknown> | unknown[]): T | undefined => {
        const p = normalizeParams(params);
        return (p !== undefined ? stmt.get(p as any) : stmt.get()) as T | undefined;
      },
      all: (params?: Record<string, unknown> | unknown[]): T[] => {
        const p = normalizeParams(params);
        return (p !== undefined ? stmt.all(p as any) : stmt.all()) as T[];
      },
    };
  }

  close(): void {
    this._db.close();
  }
}
