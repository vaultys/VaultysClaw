import { randomUUID } from 'crypto';
import type { Document, Chunk } from './types';

/**
 * Split a document into overlapping fixed-size chunks.
 * Uses character-level splitting (no token counting needed).
 */
export function chunkDocument(doc: Document, chunkSize = 1000, overlap = 100): Chunk[] {
  const text = doc.content.trim();
  if (!text) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end).trim();

    if (content.length > 20) { // skip tiny trailing chunks
      chunks.push({
        id: randomUUID(),
        docId: doc.id,
        docTitle: doc.title,
        content,
        chunkIndex: index++,
        metadata: doc.metadata,
      });
    }

    if (end === text.length) break;
    start = end - overlap;
  }

  return chunks;
}
