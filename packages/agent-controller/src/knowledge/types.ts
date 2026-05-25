export type SourceType = 'url' | 'text' | 'files';

export interface KnowledgeSourceConfig {
  /** For 'url' sources: list of URLs to index */
  urls?: string[];
  /** For 'text' sources: inline text content */
  texts?: Array<{ title: string; content: string }>;
  /** Embedding model override, defaults to 'nomic-embed-text' for ollama or 'text-embedding-3-small' for openai */
  embeddingModel?: string;
  /** Chunk size in characters (default 1000) */
  chunkSize?: number;
  /** Overlap between chunks in characters (default 100) */
  chunkOverlap?: number;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Chunk {
  id: string;
  docId: string;
  docTitle: string;
  content: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  sourceId: string;
  docsProcessed: number;
  chunksCreated: number;
  errors: string[];
}
