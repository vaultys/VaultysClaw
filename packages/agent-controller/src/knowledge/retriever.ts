import pino from 'pino';
import type { LlmConfig } from '@vaultysclaw/shared';
import { embed, deserializeEmbedding, cosineSimilarity } from './embedder';
import { getAllChunkEmbeddings } from '../db';

const logger = pino({ name: 'knowledge-retriever' });

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  docId: string;
  docTitle: string | null;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Semantic search over all stored knowledge chunks.
 * Embeds the query, computes cosine similarity against all stored embeddings,
 * returns top-k results above the score threshold.
 */
export async function searchKnowledge(
  query: string,
  llmConfig: LlmConfig,
  opts: { topK?: number; threshold?: number; sourceId?: string } = {},
): Promise<RetrievedChunk[]> {
  const { topK = 5, threshold = 0.3, sourceId } = opts;

  // 1. Embed the query
  let queryVec: Float32Array;
  try {
    queryVec = await embed(query, llmConfig);
  } catch (err) {
    logger.error({ err }, 'Failed to embed query — falling back to empty results');
    return [];
  }

  // 2. Load all chunk embeddings (in-memory similarity search)
  const rows = getAllChunkEmbeddings(sourceId);
  if (rows.length === 0) return [];

  // 3. Score each chunk
  const scored = rows.map(row => {
    const chunkVec = deserializeEmbedding(row.embedding as Buffer);
    const score = cosineSimilarity(queryVec, chunkVec);
    return {
      id: row.id,
      sourceId: row.source_id,
      docId: row.doc_id,
      docTitle: row.doc_title,
      content: row.content,
      score,
      metadata: (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })(),
    };
  });

  // 4. Sort, filter, return top-k
  return scored
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
