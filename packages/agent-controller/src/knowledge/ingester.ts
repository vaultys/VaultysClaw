import { randomUUID } from 'crypto';
import pino from 'pino';
import type { LlmConfig } from '@vaultysclaw/shared';
import type { KnowledgeSourceConfig, Document, SyncResult } from './types';
import { chunkDocument } from './chunker';
import { embed, serializeEmbedding } from './embedder';
import {
  upsertKnowledgeSource,
  updateKnowledgeSourceStatus,
  deleteChunksBySource,
  insertKnowledgeChunk,
} from '../db';

const logger = pino({ name: 'knowledge-ingester' });

/**
 * Fetch documents from a URL source.
 * Does a plain-text HTTP fetch — no JS rendering.
 */
async function fetchUrlDocs(urls: string[]): Promise<Document[]> {
  const docs: Document[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'text/html,text/plain' } });
      if (!res.ok) {
        logger.warn({ url, status: res.status }, 'Failed to fetch URL');
        continue;
      }
      const contentType = res.headers.get('content-type') ?? '';
      let text = await res.text();
      // Strip HTML tags to plain text
      if (contentType.includes('html')) {
        text = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s{3,}/g, '\n\n')
          .trim();
      }
      docs.push({ id: randomUUID(), title: url, content: text });
    } catch (err) {
      logger.error({ url, err }, 'Error fetching URL');
    }
  }
  return docs;
}

/**
 * Main ingestion pipeline.
 * Fetches documents → chunks → embeds → stores in SQLite.
 */
export async function ingestSource(
  sourceId: string,
  sourceName: string,
  sourceType: string,
  config: KnowledgeSourceConfig,
  llmConfig: LlmConfig,
): Promise<SyncResult> {
  const result: SyncResult = { sourceId, docsProcessed: 0, chunksCreated: 0, errors: [] };

  // Mark as syncing
  upsertKnowledgeSource({
    id: sourceId,
    name: sourceName,
    source_type: sourceType,
    config: JSON.stringify(config),
    status: 'syncing',
    doc_count: 0,
    chunk_count: 0,
    last_synced_at: null,
    error: null,
  });

  try {
    // 1. Load documents
    let docs: Document[] = [];
    if (sourceType === 'url' && config.urls?.length) {
      docs = await fetchUrlDocs(config.urls);
    } else if (sourceType === 'text' && config.texts?.length) {
      docs = config.texts.map(t => ({ id: randomUUID(), title: t.title, content: t.content }));
    } else {
      throw new Error(`Unsupported source type "${sourceType}" or missing config`);
    }

    logger.info({ sourceId, docCount: docs.length }, 'Documents loaded');

    // 2. Clear old chunks for this source
    deleteChunksBySource(sourceId);

    // 3. Chunk + embed + store
    const chunkSize = config.chunkSize ?? 1000;
    const chunkOverlap = config.chunkOverlap ?? 100;

    for (const doc of docs) {
      try {
        const chunks = chunkDocument(doc, chunkSize, chunkOverlap);
        for (const chunk of chunks) {
          const vec = await embed(chunk.content, llmConfig);
          insertKnowledgeChunk({
            id: chunk.id,
            source_id: sourceId,
            doc_id: chunk.docId,
            doc_title: chunk.docTitle,
            content: chunk.content,
            embedding: serializeEmbedding(vec),
            chunk_index: chunk.chunkIndex,
            metadata: JSON.stringify(chunk.metadata ?? {}),
          });
          result.chunksCreated++;
        }
        result.docsProcessed++;
        logger.info({ sourceId, docId: doc.id, chunks: chunks.length }, 'Document ingested');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Doc "${doc.title}": ${msg}`);
        logger.error({ sourceId, docId: doc.id, err }, 'Failed to process document');
      }
    }

    // 4. Update status
    updateKnowledgeSourceStatus(sourceId, 'ready', {
      docCount: result.docsProcessed,
      chunkCount: result.chunksCreated,
    });

    logger.info({ ...result }, 'Source ingestion complete');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    updateKnowledgeSourceStatus(sourceId, 'error', { error: msg });
    logger.error({ sourceId, err }, 'Source ingestion failed');
  }

  return result;
}
