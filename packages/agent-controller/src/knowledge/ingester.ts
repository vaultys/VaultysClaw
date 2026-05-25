import { randomUUID } from 'crypto';
import pino from 'pino';
import type { LlmConfig } from '@vaultysclaw/shared';
import type { KnowledgeSourceConfig, DoclingConfig, Document, SyncResult } from './types';
import { chunkDocument } from './chunker';
import { embed, serializeEmbedding } from './embedder';
import {
  upsertKnowledgeSource,
  updateKnowledgeSourceStatus,
  deleteChunksBySource,
  insertKnowledgeChunk,
} from '../db';

const logger = pino({ name: 'knowledge-ingester' });

// ---------------------------------------------------------------------------
// Docling document conversion
// ---------------------------------------------------------------------------

/**
 * Send a single URL to Docling Serve and get back Markdown.
 * Handles different response shapes across Docling Serve versions.
 */
async function convertWithDocling(doclingUrl: string, url: string): Promise<string> {
  const endpoint = `${doclingUrl}/v1alpha/convert/source`;

  logger.info({ url, endpoint }, 'Sending URL to Docling');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ http_sources: [{ url }] }),
    signal: AbortSignal.timeout(120_000), // 2 min — large PDFs take time
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Docling returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  // Docling Serve response shape varies by version — handle both
  const data = await res.json() as {
    // v0.3.x / current
    document?: { md_content?: string };
    documents?: Array<{ md_content?: string }>;
    // older shape
    output?: Array<{ content_md?: string }> | { content_md?: string };
  };

  const md =
    data?.document?.md_content ??
    data?.documents?.[0]?.md_content ??
    (Array.isArray(data?.output) ? data.output[0]?.content_md : (data?.output as { content_md?: string })?.content_md);

  if (!md) {
    logger.warn({ responseKeys: Object.keys(data) }, 'Docling: no md_content in response, falling back to raw text');
    throw new Error('Docling returned no Markdown content — check the Docling Serve version');
  }

  return md;
}

// ---------------------------------------------------------------------------
// Fallback: plain HTTP fetch with basic HTML stripping
// ---------------------------------------------------------------------------

async function fetchPlainText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'Accept': 'text/html,text/plain' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  let text = await res.text();

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
  return text;
}

// ---------------------------------------------------------------------------
// Document loading
// ---------------------------------------------------------------------------

async function loadDocuments(
  sourceType: string,
  config: KnowledgeSourceConfig,
  docling?: DoclingConfig,
): Promise<Document[]> {
  const docs: Document[] = [];

  if (sourceType === 'url' && config.urls?.length) {
    for (const url of config.urls) {
      try {
        let content: string;
        let format: 'markdown' | 'text' = 'text';

        if (docling?.url) {
          content = await convertWithDocling(docling.url, url);
          format = 'markdown'; // Docling always outputs Markdown
          logger.info({ url }, 'Docling conversion successful');
        } else {
          content = await fetchPlainText(url);
          logger.info({ url }, 'Plain fetch successful');
        }

        docs.push({
          id: randomUUID(),
          title: url,
          content,
          metadata: { source: url, format },
        });
      } catch (err) {
        logger.error({ url, err }, 'Failed to load document');
        docs.push({
          id: randomUUID(),
          title: url,
          content: '',
          metadata: { source: url, error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  } else if (sourceType === 'text' && config.texts?.length) {
    for (const t of config.texts) {
      docs.push({
        id: randomUUID(),
        title: t.title,
        content: t.content,
        metadata: { format: 'text' },
      });
    }
  } else {
    throw new Error(`Unsupported source type "${sourceType}" or missing config`);
  }

  return docs;
}

// ---------------------------------------------------------------------------
// Main ingestion pipeline
// ---------------------------------------------------------------------------

export async function ingestSource(
  sourceId: string,
  sourceName: string,
  sourceType: string,
  config: KnowledgeSourceConfig,
  llmConfig: LlmConfig,
  docling?: DoclingConfig,
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
    // 1. Load documents (via Docling or plain fetch)
    const docs = await loadDocuments(sourceType, config, docling);
    logger.info({ sourceId, docCount: docs.length, usingDocling: !!docling?.url }, 'Documents loaded');

    // 2. Clear old chunks
    deleteChunksBySource(sourceId);

    // 3. Chunk + embed + store
    const chunkSize = config.chunkSize ?? 1000;
    const chunkOverlap = config.chunkOverlap ?? 100;

    for (const doc of docs) {
      if (!doc.content.trim()) {
        result.errors.push(`Doc "${doc.title}": empty content`);
        continue;
      }

      try {
        // Detect format from metadata (set by loadDocuments)
        const fmt = (doc.metadata?.format as 'markdown' | 'text' | undefined);
        const chunks = chunkDocument(doc, chunkSize, chunkOverlap, fmt);

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

    // 4. Finalise status
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
