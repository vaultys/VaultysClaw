/**
 * MemoryRetriever — ranks and formats memories for injection into LLM context.
 *
 * Strategy (no external embeddings needed):
 *   1. Extract keywords from the query (stop-word filtered).
 *   2. Full-text search the DB for the top-N matches.
 *   3. Also pull the most-important recent memories (high importance score).
 *   4. Deduplicate, cap at `maxTokenApprox` characters, format as a block.
 *
 * The returned string is suitable for appending to the system prompt.
 */

import { MemoryStore, type MemoryRow } from "./store";

// Common English stop-words to skip when extracting query keywords.
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "is", "it", "its",
  "as", "be", "was", "are", "were", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "can", "this", "that", "these", "those", "i", "you", "he", "she", "we",
  "they", "me", "him", "her", "us", "them", "my", "your", "his", "our",
  "their", "what", "which", "who", "how", "when", "where", "why",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export interface RetrieverOptions {
  /** Max number of search results. Default 5. */
  searchLimit?: number;
  /** Max number of recent high-importance memories to always include. Default 3. */
  recentLimit?: number;
  /** Max character budget for the injected memory block. Default 2000. */
  maxChars?: number;
  /** Minimum importance score for a memory to be included in recent results. Default 0.6. */
  minImportance?: number;
}

export class MemoryRetriever {
  private store: MemoryStore;
  private opts: Required<RetrieverOptions>;

  constructor(store: MemoryStore, opts: RetrieverOptions = {}) {
    this.store = store;
    this.opts = {
      searchLimit: opts.searchLimit ?? 5,
      recentLimit: opts.recentLimit ?? 3,
      maxChars: opts.maxChars ?? 2_000,
      minImportance: opts.minImportance ?? 0.6,
    };
  }

  /**
   * Retrieve memories relevant to `query` and format them for system prompt injection.
   * Returns an empty string if no relevant memories are found.
   */
  retrieve(query: string): string {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return "";

    // Build a simpler FTS5-compatible query (AND the first 5 keywords)
    const ftsQuery = keywords.slice(0, 5).join(" ");
    let rows: MemoryRow[] = [];

    try {
      rows = this.store.search(ftsQuery, this.opts.searchLimit);
    } catch {
      // FTS search can fail if no DB is initialized yet
    }

    // Always add high-importance recent memories
    try {
      const recent = this.store.recent(undefined, 20).filter(
        (r) => r.importance >= this.opts.minImportance,
      );
      for (const r of recent.slice(0, this.opts.recentLimit)) {
        if (!rows.find((x) => x.id === r.id)) rows.push(r);
      }
    } catch {
      // ignore
    }

    if (rows.length === 0) return "";

    // Format — trim to budget
    const lines: string[] = ["## Agent Memory Context", ""];
    let chars = lines.join("\n").length;

    for (const row of rows) {
      const tags = MemoryStore.parseTags(row);
      const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
      const line = `- [${row.type}]${tagStr} ${row.content}`;
      if (chars + line.length > this.opts.maxChars) break;
      lines.push(line);
      chars += line.length + 1;
    }

    if (lines.length <= 2) return "";
    lines.push("");
    return lines.join("\n");
  }
}
