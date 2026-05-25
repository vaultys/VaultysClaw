import { randomUUID } from 'crypto';
import pino from 'pino';
import type { LlmConfig } from '@vaultysclaw/shared';
import type { KnowledgeSourceConfig, DoclingConfig, KnowledgeFileAttachment, Document, SyncResult } from './types';
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

// ---------------------------------------------------------------------------
// Docling response parsing (shared across versions)
// ---------------------------------------------------------------------------

type DoclingResponse = {
  document?: { md_content?: string; export_formats?: { md?: string } };
  documents?: Array<{ md_content?: string; export_formats?: { md?: string } }>;
  output?: Array<{ content_md?: string }> | { content_md?: string };
};

function extractMarkdown(data: DoclingResponse): string | undefined {
  return (
    data?.document?.md_content ??
    data?.document?.export_formats?.md ??
    data?.documents?.[0]?.md_content ??
    data?.documents?.[0]?.export_formats?.md ??
    (Array.isArray(data?.output)
      ? data.output[0]?.content_md
      : (data?.output as { content_md?: string } | undefined)?.content_md)
  );
}

/**
 * Build the request body for URL conversion.
 * v1alpha uses `http_sources`; v1 (stable) uses `sources` with `kind: "http"`.
 */
function buildSourceBody(url: string, path: string): string {
  if (path.includes('/v1alpha/')) {
    return JSON.stringify({ http_sources: [{ url }] });
  }
  // v1 stable API
  return JSON.stringify({ sources: [{ kind: 'http', url }] });
}

// ---------------------------------------------------------------------------
// Docling: URL conversion
// ---------------------------------------------------------------------------

/**
 * Send a single URL to Docling Serve and get back Markdown.
 * Uses the endpoint path discovered from /openapi.json (default: v1alpha).
 */
async function convertWithDocling(
  doclingUrl: string,
  url: string,
  sourcePath = '/v1alpha/convert/source',
): Promise<string> {
  const endpoint = `${doclingUrl}${sourcePath}`;
  logger.info({ url, endpoint }, 'Sending URL to Docling');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: buildSourceBody(url, sourcePath),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Docling returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as DoclingResponse;
  const md = extractMarkdown(data);

  if (!md) {
    logger.warn({ endpoint, responseKeys: Object.keys(data) }, 'Docling: no Markdown in response');
    throw new Error(`Docling returned no Markdown content (endpoint: ${endpoint})`);
  }

  return md;
}

// ---------------------------------------------------------------------------
// Docling: file upload conversion
// ---------------------------------------------------------------------------

/**
 * Send a raw file buffer to Docling Serve for conversion → Markdown.
 * Uses the endpoint path discovered from /openapi.json (default: v1alpha).
 */
async function convertFileWithDocling(
  doclingUrl: string,
  filename: string,
  content: Buffer,
  mimeType: string,
  filePath = '/v1alpha/convert/file',
): Promise<string> {
  const endpoint = `${doclingUrl}${filePath}`;
  logger.info({ filename, endpoint }, 'Sending file to Docling');

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(content)], { type: mimeType });
  // Both v1alpha and v1 use 'files' as the multipart field name
  formData.append('files', blob, filename);

  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Docling file conversion returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as DoclingResponse;
  const md = extractMarkdown(data);

  if (!md) throw new Error(`Docling returned no Markdown content for file (endpoint: ${endpoint})`);
  return md;
}

// Plain-text MIME types and extensions that can be read without Docling
const PLAIN_TEXT_TYPES = new Set([
  'text/plain', 'text/markdown', 'text/csv', 'text/html',
  'application/json', 'application/xml', 'text/xml',
]);
const PLAIN_TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm']);

function isPlainText(mimeType: string, filename: string): boolean {
  if (PLAIN_TEXT_TYPES.has(mimeType)) return true;
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return PLAIN_TEXT_EXTS.has(ext);
}

// ---------------------------------------------------------------------------
// Markdown sanitization — strip binary/non-text content before chunking
// ---------------------------------------------------------------------------

/**
 * Remove content that would confuse an LLM or inflate chunk count without
 * adding searchable text:
 *   - Markdown image embeds with data URIs  ![alt](data:image/...;base64,...)
 *   - HTML <img> tags with data URI src
 *   - Bare base64 lines (100+ chars of only base64 alphabet chars)
 *   - Trailing runs of 3+ blank lines left by the removals
 */
function sanitizeMarkdown(md: string): string {
  return md
    // Markdown inline images with base64 data URIs
    .replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '')
    // HTML img tags with data URI src (Docling sometimes emits these)
    .replace(/<img[^>]*src\s*=\s*["']data:[^"']*["'][^>]*\/?>/gi, '')
    // Bare base64 lines (≥100 chars of only A-Z a-z 0-9 +/= with no spaces)
    .replace(/^[A-Za-z0-9+/]{100,}={0,2}\s*$/gm, '')
    // Collapse triple+ blank lines into double
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  fileAttachments?: KnowledgeFileAttachment[],
): Promise<Document[]> {
  const docs: Document[] = [];

  if (sourceType === 'url' && config.urls?.length) {
    for (const url of config.urls) {
      try {
        let content: string;
        let format: 'markdown' | 'text' = 'text';

        if (docling?.url) {
          content = sanitizeMarkdown(await convertWithDocling(docling.url, url, docling.sourceEndpoint));
          format = 'markdown';
          logger.info({ url }, 'Docling URL conversion successful');
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
  } else if (sourceType === 'files' && fileAttachments?.length) {
    for (const attachment of fileAttachments) {
      try {
        const buffer = Buffer.from(attachment.content, 'base64');
        let content: string;
        let format: 'markdown' | 'text' = 'text';

        if (docling?.url) {
          // Docling can handle all file types (PDF, DOCX, etc.)
          content = sanitizeMarkdown(await convertFileWithDocling(docling.url, attachment.name, buffer, attachment.mimeType, docling.fileEndpoint));
          format = 'markdown';
          logger.info({ file: attachment.name }, 'Docling file conversion successful');
        } else if (isPlainText(attachment.mimeType, attachment.name)) {
          // Plain text files can be read directly
          content = buffer.toString('utf-8');
          format = attachment.name.endsWith('.md') || attachment.name.endsWith('.markdown')
            ? 'markdown'
            : 'text';
          logger.info({ file: attachment.name }, 'Plain text file read directly');
        } else {
          throw new Error(
            `File "${attachment.name}" is a binary format (${attachment.mimeType}). ` +
            'Configure Docling on the control plane to index PDF, DOCX and other binary documents.',
          );
        }

        docs.push({
          id: randomUUID(),
          title: attachment.name,
          content,
          metadata: { source: attachment.name, format, fileId: attachment.id, mimeType: attachment.mimeType },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ file: attachment.name, err }, 'Failed to process file attachment');
        docs.push({
          id: randomUUID(),
          title: attachment.name,
          content: '',
          metadata: { source: attachment.name, error: msg },
        });
      }
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
  fileAttachments?: KnowledgeFileAttachment[],
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
    const docs = await loadDocuments(sourceType, config, docling, fileAttachments);
    logger.info({ sourceId, docCount: docs.length, usingDocling: !!docling?.url, sourceType }, 'Documents loaded');

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
