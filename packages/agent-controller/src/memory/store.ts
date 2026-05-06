/**
 * MemoryStore — CRUD interface over the agent's persistent memory DB.
 *
 * Memories are typed facts, procedures, preferences, or conversation
 * summaries. Each is stored with a 0-1 importance score and free-text tags
 * to aid retrieval.
 *
 * The FTS5 virtual table in SQLite backs full-text search. Simple keyword
 * relevance is enough for most local-agent use-cases; embedding-based
 * retrieval can be layered on top later.
 */

import { randomUUID } from "crypto";
import {
  insertMemory,
  searchMemories,
  getRecentMemories,
  touchMemory,
  deleteMemory,
  type MemoryRow,
  type MemoryType,
} from "../db";

export type { MemoryRow, MemoryType };

export interface SaveMemoryOptions {
  type: MemoryType;
  content: string;
  tags?: string[];
  importance?: number;
}

export class MemoryStore {
  /**
   * Persist a new memory. Returns the generated ID.
   */
  save(opts: SaveMemoryOptions): string {
    const id = randomUUID();
    insertMemory({
      id,
      type: opts.type,
      content: opts.content,
      tags: JSON.stringify(opts.tags ?? []),
      importance: Math.min(1, Math.max(0, opts.importance ?? 0.5)),
    });
    return id;
  }

  /**
   * Full-text search across memory content and tags.
   * Bumps the access counter on each hit.
   */
  search(query: string, limit = 10): MemoryRow[] {
    const rows = searchMemories(query, limit);
    for (const row of rows) touchMemory(row.id);
    return rows;
  }

  /**
   * Retrieve the most recently created memories, optionally filtered by type.
   */
  recent(type?: MemoryType, limit = 20): MemoryRow[] {
    return getRecentMemories(type, limit);
  }

  /**
   * Delete a specific memory by ID.
   */
  delete(id: string): void {
    deleteMemory(id);
  }

  /**
   * Parse the JSON tags array stored in the DB back to a string[].
   */
  static parseTags(row: MemoryRow): string[] {
    try {
      return JSON.parse(row.tags) as string[];
    } catch {
      return [];
    }
  }
}
